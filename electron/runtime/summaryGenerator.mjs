/**
 * Summary generation for conversation memory
 */

import { SystemMessage, HumanMessage } from "@langchain/core/messages";
import { toText } from "./utils/textUtils.mjs";

export const SUMMARY_MAX_COMPLETION_TOKENS = 900;
export const SUMMARY_SYSTEM_PROMPT = [
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

export async function runConversationSummary({
  previousSummary = "",
  historyText = "",
  apiKey,
  modelName,
  baseUrl,
  signal,
  onLog,
}) {
  const { createModel } = await import("./modelFactory.mjs");
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
