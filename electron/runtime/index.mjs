/**
 * Runtime entry point - Multi-agent chat workflow
 */

import { HumanMessage } from "@langchain/core/messages";
import { createLangChainTools, listCapabilityTools } from "../agentTools/langchainTools.mjs";
import { createModel, buildLangSmithTracer } from "./modelFactory.mjs";
import {
  selectSkillsForPrompt,
  buildSkillPromptPatch,
  collectAllowedToolsFromSkills,
  collectRequiredStepsFromSkills,
} from "./skillMatcher.mjs";
import { buildMultiAgentGraph } from "./graphBuilder.mjs";
import { toText, chunkText } from "./utils/textUtils.mjs";
import { pushLog, extractEventTextChunk, extractEventFinalText, eventHasTag, buildToolEventLog, extractToolCallsFromEvent } from "./utils/eventHandlers.mjs";
import { STALL_POLICY, isGraphRecursionLimitError, isAbortError, buildToolSignature } from "./stallDetector.mjs";
import { runConversationSummary, SUMMARY_MAX_COMPLETION_TOKENS } from "./summaryGenerator.mjs";
import { normalizeSignalText } from "./utils/textUtils.mjs";

export const AGENT_RECURSION_LIMIT = 5000;

async function runLangGraphAgent({
  prompt,
  model,
  signal,
  onChunk,
  onLog,
  enabledSkillSpecs = [],
  langsmithEnabled,
  langsmithApiKey,
  langsmithProject,
  langsmithEndpoint,
}) {
  const logs = [];
  const { selectedSkills, matchReason } = selectSkillsForPrompt(
    prompt,
    enabledSkillSpecs,
  );
  const allowedToolNames = collectAllowedToolsFromSkills(selectedSkills);
  if (allowedToolNames.length > 0 && !allowedToolNames.includes("task_create_definition")) {
    allowedToolNames.push("task_create_definition");
  }
  const requiredSteps = collectRequiredStepsFromSkills(selectedSkills);
  const skillPatch = buildSkillPromptPatch(selectedSkills);
  const finalPrompt = prompt;

  if (selectedSkills.length > 0) {
    pushLog(
      logs,
      onLog,
      `[SKILL] 命中 ${selectedSkills.length} 个技能（${matchReason}）：${selectedSkills
        .map((item) => item.displayName || item.name)
        .join(", ")}`,
    );
    if (allowedToolNames.length > 0) {
      pushLog(
        logs,
        onLog,
        `[SKILL] 工具白名单：${allowedToolNames.join(", ")}`,
      );
    }
  } else if (enabledSkillSpecs.length > 0) {
    pushLog(logs, onLog, "[SKILL] 未命中可自动触发技能，按通用流程执行。");
  }

  if (!model) {
    const supportedTools = listCapabilityTools()
      .map((item) => `- ${item.name}: ${item.description}`)
      .join("\n");
    const fallbackAnswer = [
      "[Mock-Agent] API Key 未配置，当前无法执行真实模型推理。",
      "请在设置中配置 modelName/baseUrl/apiKey 后重试。",
      "",
      "已注册工具能力：",
      supportedTools,
      "",
      "输入摘要：",
      finalPrompt.slice(0, 260),
    ].join("\n");

    for (const part of chunkText(fallbackAnswer)) {
      onChunk?.(part);
    }
    pushLog(logs, onLog, "[WARN] API Key 未配置，已返回模拟结果。");

    return {
      answer: fallbackAnswer,
      logs,
    };
  }

  const tools = await createLangChainTools({
    baseDir: process.cwd(),
    runContext: {
      source: "chat_agent",
    },
    allowedToolNames,
    onLog: (message) => {
      pushLog(logs, onLog, `[TOOL] ${message}`);
    },
  });

  const langsmithTracer = buildLangSmithTracer({
    enabled: langsmithEnabled,
    apiKey: langsmithApiKey,
    projectName: langsmithProject,
    endpoint: langsmithEndpoint,
  });

  if (langsmithTracer) {
    pushLog(logs, onLog, "[INFO] LangSmith 追踪已启用。");
  }

  const graph = buildMultiAgentGraph({
    model,
    tools,
    skillPatch,
    requiredSteps,
  });

  pushLog(logs, onLog, "[INFO] 多智能体 LangGraph 已启动（token 流式）。");

  const stateInput = {
    input: finalPrompt,
    messages: [new HumanMessage(finalPrompt)],
  };

  let answer = "";
  let latestVerifierOutput = "";
  let finalAnswer = "";
  let stallReason = "";
  let lastToolSignature = "";
  let repeatedToolErrors = 0;
  let lastExecutorSignature = "";
  let repeatedExecutorOutputs = 0;
  let lastVerifierSignature = "";
  let repeatedVerifierOutputs = 0;
  let noProgressExecutions = 0;

  const abortController = new AbortController();
  if (signal) {
    if (signal.aborted) {
      abortController.abort();
    } else if (typeof signal.addEventListener === "function") {
      signal.addEventListener("abort", () => abortController.abort(), { once: true });
    }
  }
  const runSignal = abortController.signal;

  try {
    const eventStream = graph.streamEvents(stateInput, {
      signal: runSignal,
      version: "v2",
      recursionLimit: AGENT_RECURSION_LIMIT,
      callbacks: langsmithTracer ? [langsmithTracer] : undefined,
    });

    for await (const event of eventStream) {
      if (!event || typeof event !== "object") {
        continue;
      }

      if (event.event === "on_chat_model_stream") {
        if (!eventHasTag(event, "agent:verifier")) {
          continue;
        }
        const delta = extractEventTextChunk(event);
        if (delta) {
          answer += delta;
          onChunk?.(delta);
        }
        continue;
      }

      if (event.event === "on_chat_model_end") {
        if (!eventHasTag(event, "agent:verifier")) {
          continue;
        }
        const finalText = extractEventFinalText(event);
        if (finalText) {
          const normalized = normalizeSignalText(finalText);
          if (normalized && normalized === lastVerifierSignature) {
            repeatedVerifierOutputs += 1;
          } else {
            repeatedVerifierOutputs = 0;
            lastVerifierSignature = normalized;
          }
          latestVerifierOutput = finalText;
        }
        if (
          repeatedVerifierOutputs >= STALL_POLICY.maxRepeatedVerifierOutputs &&
          !stallReason
        ) {
          stallReason = "验证结果重复且无新进展";
          abortController?.abort();
        }
        continue;
      }

      if (event.event === "on_chain_end") {
        const output = event?.data?.output;
        if (output && typeof output === "object" && output.finalAnswer) {
          finalAnswer = toText(output.finalAnswer).trim();
        }
        const toolCalls = extractToolCallsFromEvent(event);
        if (eventHasTag(event, "agent:executor")) {
          if (toolCalls.length === 0) {
            const executorText = extractEventFinalText(event);
            const signature = normalizeSignalText(executorText || "");
            if (signature && signature === lastExecutorSignature) {
              repeatedExecutorOutputs += 1;
            } else {
              repeatedExecutorOutputs = 0;
              lastExecutorSignature = signature;
            }
            noProgressExecutions += 1;
          } else {
            noProgressExecutions = 0;
            repeatedExecutorOutputs = 0;
          }
        }
        if (output && Array.isArray(output.logs)) {
          for (const item of output.logs) {
            if (typeof item === "string" && item.trim()) {
              pushLog(logs, onLog, item);
            }
          }
        }
        if (
          repeatedExecutorOutputs >= STALL_POLICY.maxRepeatedExecutorOutputs &&
          !stallReason
        ) {
          stallReason = "执行输出重复，未触发新工具";
          abortController?.abort();
        }
        if (noProgressExecutions >= STALL_POLICY.maxNoProgressExecutions && !stallReason) {
          stallReason = "连续多轮无有效进展";
          abortController?.abort();
        }
      }

      if (
        event.event === "on_tool_start" ||
        event.event === "on_tool_end" ||
        event.event === "on_tool_error"
      ) {
        if (event.event === "on_tool_error") {
          const signature = buildToolSignature(event);
          if (signature && signature === lastToolSignature) {
            repeatedToolErrors += 1;
          } else {
            repeatedToolErrors = 1;
            lastToolSignature = signature;
          }
          if (repeatedToolErrors >= STALL_POLICY.maxRepeatedToolErrors && !stallReason) {
            stallReason = "工具重复失败，可能需要人工介入";
            abortController?.abort();
          }
        }

        if (event.event === "on_tool_end") {
          repeatedToolErrors = 0;
          noProgressExecutions = 0;
          repeatedVerifierOutputs = 0;
        }

        const toolLog = buildToolEventLog(event);
        if (toolLog && toolLog.name) {
          const logText = event.event === "on_tool_start"
            ? `[TOOL] 开始 ${toolLog.name} ${toolLog.input}`.trim()
            : event.event === "on_tool_end"
            ? `[TOOL] 完成 ${toolLog.name} ${toolLog.output}`.trim()
            : `[TOOL] 失败 ${toolLog.name}: ${toText(event?.data?.error)}`;
          pushLog(logs, onLog, logText);
        }
      }
    }
  } catch (error) {
    if (!isGraphRecursionLimitError(error) && !isAbortError(error)) {
      throw error;
    }

    if (stallReason) {
      pushLog(logs, onLog, `[WARN] 智能体因停滞检测停止：${stallReason}`);
    } else if (isGraphRecursionLimitError(error)) {
      pushLog(
        logs,
        onLog,
        `[WARN] 智能体达到最大推理步数（${AGENT_RECURSION_LIMIT}）后已停止自动重试。`,
      );
    }

    if (!answer && latestVerifierOutput) {
      answer = latestVerifierOutput;
    }

    if (!answer && finalAnswer) {
      answer = finalAnswer;
    }

    if (!answer) {
      const reasonText = stallReason
        ? `原因：检测到${stallReason}。`
        : `原因：智能体在 ${AGENT_RECURSION_LIMIT} 步内没有收敛到最终结果。`;
      answer = [
        "任务已停止自动重试。",
        "",
        reasonText,
        "常见原因包括工具连续失败、页面状态不满足，或当前步骤需要人工介入。",
        "请根据上面的工具日志检查阻塞点后重试。",
      ].join("\n");
      onChunk?.(answer);
    }
  }

  if (!answer && latestVerifierOutput) {
    answer = latestVerifierOutput;
    onChunk?.(answer);
  }

  if (!answer && finalAnswer) {
    answer = finalAnswer;
    onChunk?.(answer);
  }

  if (!answer) {
    answer = [
      "多智能体执行完成，但未生成可用的最终答复。",
      "请查看工具日志或缩小任务范围后重试。",
    ].join("\n");
    onChunk?.(answer);
  }

  pushLog(logs, onLog, "[INFO] 多智能体执行完成。");
  return {
    answer,
    logs,
  };
}

export async function runMultiAgentChatStream({
  prompt,
  apiKey,
  modelName,
  baseUrl,
  langsmithEnabled = false,
  langsmithApiKey = "",
  langsmithProject,
  langsmithEndpoint,
  enabledSkillSpecs = [],
  signal,
  onChunk,
  onLog,
}) {
  const model = createModel(apiKey, modelName, baseUrl);
  return runLangGraphAgent({
    prompt,
    model,
    enabledSkillSpecs,
    signal,
    onChunk,
    onLog,
    langsmithEnabled,
    langsmithApiKey,
    langsmithProject,
    langsmithEndpoint,
  });
}

export async function runMultiAgentChat({
  prompt,
  apiKey,
  modelName,
  baseUrl,
  langsmithEnabled = false,
  langsmithApiKey = "",
  langsmithProject,
  langsmithEndpoint,
  enabledSkillSpecs = [],
}) {
  return runMultiAgentChatStream({
    prompt,
    apiKey,
    modelName,
    baseUrl,
    langsmithEnabled,
    langsmithApiKey,
    langsmithProject,
    langsmithEndpoint,
    enabledSkillSpecs,
  });
}

export async function runTaskWorkflow({
  prompt,
  apiKey,
  modelName,
  baseUrl,
  langsmithEnabled = false,
  langsmithApiKey = "",
  langsmithProject,
  langsmithEndpoint,
  enabledSkillSpecs = [],
}) {
  const result = await runMultiAgentChat({
    prompt,
    apiKey,
    modelName,
    baseUrl,
    langsmithEnabled,
    langsmithApiKey,
    langsmithProject,
    langsmithEndpoint,
    enabledSkillSpecs,
  });

  return {
    answer: `任务已完成。\n\n${result.answer}`,
    logs: ["[INFO] 任务执行引擎已初始化。", ...result.logs],
  };
}

// Re-export summary generator for backward compatibility
export { runConversationSummary } from "./summaryGenerator.mjs";
