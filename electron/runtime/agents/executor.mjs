/**
 * Executor agent implementation
 */

import { SystemMessage } from "@langchain/core/messages";

export const EXECUTOR_SYSTEM_PROMPT = [
  "你是任务执行智能体，必须遵循既定计划，优先使用工具完成真实操作。",
  "工具连续失败两次、工具不可用、或明显需要用户介入时，停止重试并说明阻塞原因。",
  "如需创建任务，使用工具 task_create_definition，并填写 title/prompt/description/schedule。",
  "不要无限循环调用工具；信息足够时直接进入收敛。",
].join("\n");

export function createExecutorNode(modelWithTools, skillPatch, requiredSteps = []) {
  const executorPromptBase = [EXECUTOR_SYSTEM_PROMPT, skillPatch]
    .filter(Boolean)
    .join("\n\n");
  const requiredStepsBlock = Array.isArray(requiredSteps) && requiredSteps.length > 0
    ? `必须遵循以下步骤：\n${requiredSteps.map((step, index) => `  ${index + 1}) ${step}`).join("\n")}`
    : "";

  return async (state, config) => {
    const { mergeConfigTag, tagAgentMessage } = await import("../graphBuilder.mjs");

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
}
