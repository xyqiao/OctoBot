/**
 * Verifier agent implementation
 */

import { SystemMessage } from "@langchain/core/messages";
import { isAIMessage } from "@langchain/core/messages";

export const VERIFIER_SYSTEM_PROMPT = [
  "你是结果验证智能体，负责检查执行结果的完整性与一致性。",
  "如有缺口，给出明确原因与下一步建议；如已满足，输出最终答复。",
  "输出使用简洁 Markdown，先给结论，再给关键细节。",
].join("\n");

export function createVerifierNode(model, skillPatch) {
  const verifierPromptBase = [VERIFIER_SYSTEM_PROMPT, skillPatch]
    .filter(Boolean)
    .join("\n\n");

  return async (state, config) => {
    const { mergeConfigTag, tagAgentMessage } = await import("../graphBuilder.mjs");

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
    return {
      messages: [response],
      finalAnswer: response?.content || "",
    };
  };
}

export function shouldContinueAfterVerifier(state) {
  const messages = Array.isArray(state?.messages) ? state.messages : [];
  const lastMessage = messages[messages.length - 1];

  if (!lastMessage || !isAIMessage(lastMessage)) {
    return "executor";
  }

  const hasToolCalls =
    Array.isArray(lastMessage?.tool_calls) && lastMessage.tool_calls.length > 0;

  if (hasToolCalls) {
    return "executor";
  }

  return "__end__";
}
