import { ChatOpenAI } from "@langchain/openai";
import {
  HumanMessage,
  SystemMessage,
  isAIMessage,
} from "@langchain/core/messages";
import { Annotation, StateGraph, START, END } from "@langchain/langgraph";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import {
  createLangChainTools,
  listCapabilityTools,
} from "./agentTools/langchainTools.mjs";

const PLANNER_SYSTEM_PROMPT = [
  "你是任务规划智能体，负责把用户目标拆解为清晰、可执行的步骤。",
  "输出要求：用简洁中文列出步骤，优先考虑可通过工具完成的操作。",
  "避免空泛建议，不要执行工具调用。",
].join("\n");

const EXECUTOR_SYSTEM_PROMPT = [
  "你是任务执行智能体，必须遵循既定计划，优先使用工具完成真实操作。",
  "工具连续失败两次、工具不可用、或明显需要用户介入时，停止重试并说明阻塞原因。",
  "不要无限循环调用工具；信息足够时直接进入收敛。",
].join("\n");

const VERIFIER_SYSTEM_PROMPT = [
  "你是结果验证智能体，负责检查执行结果的完整性与一致性。",
  "如有缺口，给出明确原因与下一步建议；如已满足，输出最终答复。",
  "输出使用简洁 Markdown，先给结论，再给关键细节。",
].join("\n");


const AGENT_RECURSION_LIMIT = 50;
const SUMMARY_MAX_COMPLETION_TOKENS = 900;
const SUMMARY_SYSTEM_PROMPT = [
  "你负责把一段持续协作会话压缩成长期记忆摘要。",
  "只保留长期稳定信息：用户目标、已确认约束、已完成事项、未完成事项、用户偏好。",
  "不要保留寒暄、重复描述、逐步工具日志、冗长代码或页面快照细节。",
  "如果新增历史与旧摘要冲突，以新增历史为准。",
  "输出必须使用以下固定结构：",
  "- 用户目标：",
  "- 已确认约束：",
  "- 已完成事项：",
  "- 未完成事项：",
  "- 用户偏好：",
  "尽量控制在 900 token 以内，使用简洁中文。",
].join("\n");

const SKILL_TOOL_NAME_MAP = {
  office_read_document: "office_read_document",
  read_document: "office_read_document",
  office_write_document: "office_write_document",
  write_document: "office_write_document",
};

function toText(content) {
  if (typeof content === "string") {
    return content;
  }
  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (typeof item === "string") {
          return item;
        }
        if (item && typeof item === "object" && "text" in item) {
          return String(item.text);
        }
        return "";
      })
      .filter(Boolean)
      .join("\n");
  }
  return String(content ?? "");
}

function chunkText(answer, chunkSize = 160) {
  const text = toText(answer);
  if (!text) {
    return [];
  }
  if (text.length <= chunkSize) {
    return [text];
  }

  const chunks = [];
  let start = 0;
  while (start < text.length) {
    chunks.push(text.slice(start, start + chunkSize));
    start += chunkSize;
  }
  return chunks;
}

function summarizeJson(value, maxLen = 240) {
  try {
    const text = JSON.stringify(value);
    if (!text) {
      return "";
    }
    if (text.length <= maxLen) {
      return text;
    }
    return `${text.slice(0, maxLen)}...(truncated)`;
  } catch {
    return "";
  }
}

function pushLog(logs, onLog, text) {
  logs.push(text);
  onLog?.(text);
}

function isGraphRecursionLimitError(error) {
  const message = toText(error?.message || error);
  const name = typeof error?.name === "string" ? error.name : "";
  return (
    name === "GraphRecursionError" ||
    message.includes("GRAPH_RECURSION_LIMIT") ||
    (message.includes("Recursion limit") && message.includes("stop condition"))
  );
}

function normalizeText(value) {
  return toText(value).toLowerCase();
}

function normalizeSkillToolName(value) {
  const raw = toText(value).trim().toLowerCase();
  if (!raw) {
    return "";
  }
  return SKILL_TOOL_NAME_MAP[raw] || raw;
}

function uniqueStrings(values = []) {
  const seen = new Set();
  const result = [];
  for (const value of values) {
    const text = toText(value).trim();
    if (!text || seen.has(text)) {
      continue;
    }
    seen.add(text);
    result.push(text);
  }
  return result;
}

function normalizeSkillSpec(raw) {
  const source = raw && typeof raw === "object" ? raw : {};
  const aliases = Array.isArray(source?.triggers?.aliases)
    ? source.triggers.aliases
    : [];
  const keywords = Array.isArray(source?.triggers?.keywords)
    ? source.triggers.keywords
    : [];
  const tools = Array.isArray(source.tools) ? source.tools : [];
  const fallback = Array.isArray(source.fallback) ? source.fallback : [];
  const steps = Array.isArray(source.steps) ? source.steps : [];
  const policy = source.policy && typeof source.policy === "object"
    ? source.policy
    : null;

  return {
    id: toText(source.id || "").trim(),
    name: toText(source.name || source.displayName || "").trim(),
    displayName: toText(source.displayName || source.name || "").trim(),
    description: toText(source.description || "").trim(),
    purpose: toText(source.purpose || "").trim(),
    trigger: toText(source.trigger || "").trim(),
    tools: uniqueStrings(tools.map(normalizeSkillToolName).filter(Boolean)),
    fallback: uniqueStrings(fallback),
    steps: uniqueStrings(steps),
    policy,
    triggers: {
      aliases: uniqueStrings(aliases),
      keywords: uniqueStrings(keywords),
    },
  };
}

function hasSkillExplicitMention(promptLower, skill) {
  const names = uniqueStrings([
    skill.displayName,
    skill.name,
    ...skill.triggers.aliases,
  ]).map((item) => item.toLowerCase());

  return names.some((name) => {
    if (!name) {
      return false;
    }
    return (
      promptLower.includes(`$${name}`) ||
      promptLower.includes(`#${name}`) ||
      promptLower.includes(name)
    );
  });
}

function computeSkillSemanticScore(promptLower, skill) {
  const tokens = uniqueStrings([
    ...skill.triggers.keywords,
    ...skill.triggers.aliases,
    ...skill.tools,
    skill.name,
    skill.displayName,
  ]).map((item) => item.toLowerCase());

  let score = 0;
  for (const token of tokens) {
    if (!token) {
      continue;
    }
    if (!promptLower.includes(token)) {
      continue;
    }
    if (skill.tools.map((item) => item.toLowerCase()).includes(token)) {
      score += 2;
      continue;
    }
    if (token.length >= 4) {
      score += 2;
    } else {
      score += 1;
    }
  }

  const purposeText = normalizeText(
    `${skill.description}\n${skill.purpose}\n${skill.trigger}`,
  );
  if (
    purposeText &&
    promptLower.includes(purposeText.slice(0, Math.min(30, purposeText.length)))
  ) {
    score += 1;
  }

  return score;
}

function selectSkillsForPrompt(prompt, enabledSkillSpecs = [], maxSkills = 3) {
  const skills = enabledSkillSpecs
    .map(normalizeSkillSpec)
    .filter((skill) => skill.displayName || skill.name);

  if (skills.length === 0) {
    return {
      selectedSkills: [],
      matchReason: "none",
    };
  }

  const promptLower = normalizeText(prompt);
  const explicitMatches = skills.filter((skill) =>
    hasSkillExplicitMention(promptLower, skill),
  );

  const selected = [];
  const selectedIds = new Set();
  for (const skill of explicitMatches) {
    const id = skill.id || skill.name || skill.displayName;
    if (selectedIds.has(id)) {
      continue;
    }
    selected.push(skill);
    selectedIds.add(id);
    if (selected.length >= maxSkills) {
      break;
    }
  }

  const reason = selected.length > 0 ? "explicit" : "semantic";
  if (selected.length < maxSkills) {
    const semanticCandidates = skills
      .map((skill) => ({
        skill,
        score: computeSkillSemanticScore(promptLower, skill),
      }))
      .filter((item) => item.score >= 2)
      .sort((left, right) => right.score - left.score);

    for (const candidate of semanticCandidates) {
      const id =
        candidate.skill.id ||
        candidate.skill.name ||
        candidate.skill.displayName;
      if (selectedIds.has(id)) {
        continue;
      }
      selected.push(candidate.skill);
      selectedIds.add(id);
      if (selected.length >= maxSkills) {
        break;
      }
    }
  }

  return {
    selectedSkills: selected,
    matchReason: selected.length > 0 ? reason : "none",
  };
}

function buildSkillPromptPatch(selectedSkills = []) {
  if (!Array.isArray(selectedSkills) || selectedSkills.length === 0) {
    return "";
  }

  const sections = selectedSkills.map((skill, index) => {
    const policyTools = Array.isArray(skill?.policy?.allowedTools)
      ? skill.policy.allowedTools
      : [];
    const policySteps = Array.isArray(skill?.policy?.requiredSteps)
      ? skill.policy.requiredSteps
      : [];

    return [
      `${index + 1}. ${skill.displayName || skill.name}`,
      skill.description ? `- 描述: ${skill.description}` : "",
      skill.purpose ? `- 用途: ${skill.purpose}` : "",
      skill.trigger ? `- 触发条件: ${skill.trigger}` : "",
      skill.steps.length > 0
        ? `- 执行步骤:
${skill.steps.map((step, stepIndex) => `  ${stepIndex + 1}) ${step}`).join("\n")}`
        : "",
      policySteps.length > 0
        ? `- 策略步骤:
${policySteps.map((step, stepIndex) => `  ${stepIndex + 1}) ${step}`).join("\n")}`
        : "",
      skill.tools.length > 0 ? `- 依赖工具: ${skill.tools.join(", ")}` : "",
      policyTools.length > 0 ? `- 策略工具: ${policyTools.join(", ")}` : "",
      skill.fallback.length > 0
        ? `- 失败回退:
${skill.fallback.map((item) => `  - ${item}`).join("\n")}`
        : "",
    ]
      .filter(Boolean)
      .join("\n");
  });

  return [
    "你当前必须遵循以下已匹配技能规范：",
    ...sections,
    "执行要求：严格按技能步骤执行；工具调用优先使用技能列出的依赖工具；失败时按回退策略处理并说明；同一步骤连续失败两次后停止重试并汇报阻塞原因。",
  ].join("\n\n");
}

function collectAllowedToolsFromSkills(selectedSkills = []) {
  const tools = uniqueStrings(
    selectedSkills
      .flatMap((skill) => {
        const explicitTools = Array.isArray(skill.tools) ? skill.tools : [];
        const policyTools = Array.isArray(skill?.policy?.allowedTools)
          ? skill.policy.allowedTools
          : [];
        return [...explicitTools, ...policyTools];
      })
      .map(normalizeSkillToolName)
      .filter(Boolean),
  );
  return tools;
}

function collectRequiredStepsFromSkills(selectedSkills = []) {
  const steps = uniqueStrings(
    selectedSkills
      .flatMap((skill) => {
        const explicitSteps = Array.isArray(skill.steps) ? skill.steps : [];
        const policySteps = Array.isArray(skill?.policy?.requiredSteps)
          ? skill.policy.requiredSteps
          : [];
        return [...explicitSteps, ...policySteps];
      })
      .filter(Boolean),
  );
  return steps;
}

function createModel(apiKey, modelName = "gpt-4o-mini", baseUrl = "", extraOptions = {}) {
  if (!apiKey || !apiKey.trim()) {
    return null;
  }

  const options = {
    apiKey,
    model: modelName,
    temperature: 0.2,
    ...extraOptions,
  };

  if (baseUrl && baseUrl.trim()) {
    options.configuration = {
      baseURL: baseUrl.trim(),
    };
  }

  return new ChatOpenAI(options);
}

function extractAssistantAnswer(messages) {
  if (!Array.isArray(messages)) {
    return "";
  }

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    const type =
      typeof message?.getType === "function"
        ? message.getType()
        : message?._getType?.();

    if (type === "ai" || message?.role === "assistant") {
      return toText(message.content);
    }
  }

  const lastMessage = messages[messages.length - 1];
  return toText(lastMessage?.content);
}

function extractEventTextChunk(event) {
  const chunk = event?.data?.chunk;
  if (!chunk) {
    return "";
  }

  if (typeof chunk === "string") {
    return chunk;
  }

  if (typeof chunk?.text === "string") {
    return chunk.text;
  }

  if (chunk?.message?.content !== undefined) {
    return toText(chunk.message.content);
  }

  if (chunk?.content !== undefined) {
    return toText(chunk.content);
  }

  return "";
}

function extractEventFinalText(event) {
  const output = event?.data?.output;
  if (!output) {
    return "";
  }
  if (output?.message?.content !== undefined) {
    return toText(output.message.content);
  }
  if (output?.content !== undefined) {
    return toText(output.content);
  }
  return toText(output);
}

function buildToolEventLog(event) {
  if (event.event === "on_tool_start") {
    return `[TOOL] 开始 ${event.name} ${summarizeJson(event?.data?.input)}`.trim();
  }
  if (event.event === "on_tool_end") {
    return `[TOOL] 完成 ${event.name} ${summarizeJson(event?.data?.output)}`.trim();
  }
  if (event.event === "on_tool_error") {
    return `[TOOL] 失败 ${event.name}: ${toText(event?.data?.error)}`;
  }
  return "";
}

function extractPlanText(raw) {
  const text = toText(raw).trim();
  if (!text) {
    return "";
  }
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenced && fenced[1]) {
    return fenced[1].trim();
  }
  return text;
}

function tagAgentMessage(message, name) {
  if (!message || typeof message !== "object") {
    return message;
  }
  message.name = name;
  if (message.lc_kwargs && typeof message.lc_kwargs === "object") {
    message.lc_kwargs.name = name;
  }
  return message;
}

function mergeConfigTag(config, tag) {
  const tags = Array.isArray(config?.tags) ? config.tags : [];
  return {
    ...config,
    tags: [...tags, tag],
  };
}

function eventHasTag(event, tag) {
  const tags = Array.isArray(event?.tags)
    ? event.tags
    : Array.isArray(event?.metadata?.tags)
      ? event.metadata.tags
      : [];
  return tags.includes(tag);
}

function buildMultiAgentGraph({ model, tools, skillPatch, requiredSteps = [] }) {
  const GraphState = Annotation.Root({
    input: Annotation(),
    plan: Annotation(),
    finalAnswer: Annotation(),
    logs: Annotation({
      reducer: (left = [], right) => {
        const next = Array.isArray(right) ? right : right ? [right] : [];
        return left.concat(next);
      },
      default: () => [],
    }),
    messages: Annotation({
      reducer: (left = [], right) => {
        if (!right) {
          return left;
        }
        const next = Array.isArray(right) ? right : [right];
        return left.concat(next);
      },
      default: () => [],
    }),
  });

  const plannerPrompt = [PLANNER_SYSTEM_PROMPT, skillPatch]
    .filter(Boolean)
    .join("\n\n");
  const executorPromptBase = [EXECUTOR_SYSTEM_PROMPT, skillPatch]
    .filter(Boolean)
    .join("\n\n");
  const requiredStepsBlock = Array.isArray(requiredSteps) && requiredSteps.length > 0
    ? `必须遵循以下步骤：\n${requiredSteps.map((step, index) => `  ${index + 1}) ${step}`).join("\n")}`
    : "";
  const verifierPromptBase = [VERIFIER_SYSTEM_PROMPT, skillPatch]
    .filter(Boolean)
    .join("\n\n");

  const modelWithTools =
    typeof model?.bindTools === "function" ? model.bindTools(tools) : model;

  const plannerNode = async (state, config) => {
    const response = await model.invoke(
      [new SystemMessage(plannerPrompt), new HumanMessage(state.input)],
      mergeConfigTag(config, "agent:planner"),
    );
    tagAgentMessage(response, "planner");
    const planText = extractPlanText(response?.content);
    return {
      messages: [response],
      plan: planText,
      logs: planText ? "[Planner] 已生成执行计划。" : "[Planner] 未生成计划。",
    };
  };

  const executorNode = async (state, config) => {
    const planBlock = state.plan ? `当前计划：
${state.plan}` : "";
    const executorPrompt = [executorPromptBase, requiredStepsBlock, planBlock]
      .filter(Boolean)
      .join("\n\n");
    const response = await modelWithTools.invoke(
      [new SystemMessage(executorPrompt), ...state.messages],
      mergeConfigTag(config, "agent:executor"),
    );
    tagAgentMessage(response, "executor");
    return {
      messages: [response],
    };
  };

  const verifierNode = async (state, config) => {
    const planBlock = state.plan ? `执行计划：
${state.plan}` : "";
    const verifierPrompt = [verifierPromptBase, planBlock]
      .filter(Boolean)
      .join("\n\n");
    const response = await model.invoke(
      [new SystemMessage(verifierPrompt), ...state.messages],
      mergeConfigTag(config, "agent:verifier"),
    );
    tagAgentMessage(response, "verifier");
    const finalAnswer = toText(response?.content).trim();
    return {
      messages: [response],
      finalAnswer,
      logs: finalAnswer ? "[Verifier] 已生成最终答复。" : "[Verifier] 未生成最终答复。",
    };
  };

  const toolNode = new ToolNode(tools);
  const shouldContinue = (state) => {
    const lastMessage = state.messages[state.messages.length - 1];
    if (lastMessage && isAIMessage(lastMessage)) {
      const toolCalls = Array.isArray(lastMessage.tool_calls)
        ? lastMessage.tool_calls
        : [];
      if (toolCalls.length > 0) {
        return "tools";
      }
    }
    return "verifier";
  };

  return new StateGraph(GraphState)
    .addNode("planner", plannerNode)
    .addNode("executor", executorNode)
    .addNode("tools", toolNode)
    .addNode("verifier", verifierNode)
    .addEdge(START, "planner")
    .addEdge("planner", "executor")
    .addConditionalEdges("executor", shouldContinue, ["tools", "verifier"])
    .addEdge("tools", "executor")
    .addEdge("verifier", END)
    .compile();
}

async function runLangGraphAgent({
  prompt,
  model,
  signal,
  onChunk,
  onLog,
  enabledSkillSpecs = [],
}) {
  const logs = [];
  const { selectedSkills, matchReason } = selectSkillsForPrompt(
    prompt,
    enabledSkillSpecs,
  );
  const allowedToolNames = collectAllowedToolsFromSkills(selectedSkills);
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

  try {
    const eventStream = graph.streamEvents(stateInput, {
      signal,
      version: "v2",
      recursionLimit: AGENT_RECURSION_LIMIT,
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
          latestVerifierOutput = finalText;
        }
        continue;
      }

      if (event.event === "on_chain_end") {
        const output = event?.data?.output;
        if (output && typeof output === "object" && output.finalAnswer) {
          finalAnswer = toText(output.finalAnswer).trim();
        }
        if (output && Array.isArray(output.logs)) {
          for (const item of output.logs) {
            if (typeof item === "string" && item.trim()) {
              pushLog(logs, onLog, item);
            }
          }
        }
      }

      if (
        event.event === "on_tool_start" ||
        event.event === "on_tool_end" ||
        event.event === "on_tool_error"
      ) {
        const logLine = buildToolEventLog(event);
        if (logLine) {
          pushLog(logs, onLog, logLine);
        }
      }
    }
  } catch (error) {
    if (!isGraphRecursionLimitError(error)) {
      throw error;
    }

    pushLog(
      logs,
      onLog,
      `[WARN] 智能体达到最大推理步数（${AGENT_RECURSION_LIMIT}）后已停止自动重试。`,
    );

    if (!answer && latestVerifierOutput) {
      answer = latestVerifierOutput;
    }

    if (!answer && finalAnswer) {
      answer = finalAnswer;
    }

    if (!answer) {
      answer = [
        "任务已停止自动重试。",
        "",
        `原因：智能体在 ${AGENT_RECURSION_LIMIT} 步内没有收敛到最终结果。`,
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
  });
}

export async function runMultiAgentChat({
  prompt,
  apiKey,
  modelName,
  baseUrl,
  enabledSkillSpecs = [],
}) {
  return runMultiAgentChatStream({
    prompt,
    apiKey,
    modelName,
    baseUrl,
    enabledSkillSpecs,
  });
}

export async function runConversationSummary({
  previousSummary = "",
  historyText = "",
  apiKey,
  modelName,
  baseUrl,
  signal,
  onLog,
}) {
  const model = createModel(apiKey, modelName, baseUrl, {
    maxCompletionTokens: SUMMARY_MAX_COMPLETION_TOKENS,
  });
  if (!model) {
    onLog?.("[摘要] API Key 未配置，跳过摘要刷新。");
    return {
      summaryText: toText(previousSummary).trim(),
      applied: false,
    };
  }

  const prompt = [
    "已有摘要：",
    toText(previousSummary).trim() || "(无摘要)",
    "",
    "新增历史消息：",
    toText(historyText).trim() || "(无新增历史)",
  ].join("\n");

  const response = await model.invoke(
    [new SystemMessage(SUMMARY_SYSTEM_PROMPT), new HumanMessage(prompt)],
    signal ? { signal } : undefined,
  );

  const summaryText = toText(response?.content).trim();
  return {
    summaryText: summaryText || toText(previousSummary).trim(),
    applied: true,
  };
}

export async function runTaskWorkflow({
  prompt,
  apiKey,
  modelName,
  baseUrl,
  enabledSkillSpecs = [],
}) {
  const result = await runMultiAgentChat({
    prompt,
    apiKey,
    modelName,
    baseUrl,
    enabledSkillSpecs,
  });

  return {
    answer: `任务已完成。\n\n${result.answer}`,
    logs: ["[INFO] 任务执行引擎已初始化。", ...result.logs],
  };
}
