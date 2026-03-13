/**
 * Planner agent implementation
 */

import { SystemMessage, HumanMessage } from "@langchain/core/messages";

export const PLANNER_SYSTEM_PROMPT = [
  "你是任务规划智能体，负责把用户目标拆解为清晰、可执行的步骤。",
  "输出要求：用简洁中文列出步骤，优先考虑可通过工具完成的操作。",
  "避免空泛建议，不要执行工具调用。",
].join("\n");

export function createPlannerNode(model, skillPatch) {
  const plannerPrompt = [PLANNER_SYSTEM_PROMPT, skillPatch]
    .filter(Boolean)
    .join("\n\n");

  return async (state, config) => {
    const { mergeConfigTag, tagAgentMessage } = await import("../graphBuilder.mjs");
    const { extractPlanText } = await import("../utils/textUtils.mjs");

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
}
