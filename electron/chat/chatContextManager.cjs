const {
  countTextTokens,
  estimatePromptTokens,
  DEFAULT_RESERVED_TOOL_TOKENS,
} = require("./tokenCounter.cjs");

const KEEP_RECENT_COUNT = 8;
const MIN_SUMMARY_BATCH_TOKENS = 1_200;
const MAX_TRANSITION_TOKENS = 1_600;
const MAX_SUMMARY_TOKENS = 900;

function toText(value, fallback = "") {
  if (typeof value === "string") {
    return value;
  }
  if (value === undefined || value === null) {
    return fallback;
  }
  return String(value);
}

function roleLabel(role) {
  if (role === "assistant") {
    return "助手";
  }
  if (role === "system") {
    return "系统";
  }
  return "用户";
}

function normalizeMessages(messages = []) {
  if (!Array.isArray(messages)) {
    return [];
  }

  return messages
    .map((message) => ({
      id: toText(message?.id, "").trim(),
      role: toText(message?.role, "user").trim() || "user",
      text: toText(message?.content, "").trim(),
      timestamp: Number(message?.timestamp) || 0,
    }))
    .filter((message) => message.text.length > 0);
}

function transcriptFromMessages(messages = []) {
  if (!Array.isArray(messages) || messages.length === 0) {
    return "(无历史对话)";
  }

  return messages
    .map((message) => `${roleLabel(message.role)}:\n${message.text}`)
    .join("\n\n");
}

function splitChatHistory(messages = [], memory = {}, options = {}) {
  const normalized = normalizeMessages(messages);
  let latestUserIndex = -1;

  for (let index = normalized.length - 1; index >= 0; index -= 1) {
    if (normalized[index].role === "user") {
      latestUserIndex = index;
      break;
    }
  }

  const latestUserMessage = latestUserIndex >= 0
    ? normalized[latestUserIndex].text
    : toText(options.latestUserMessage, "").trim();
  const historyBeforeLatestUser = latestUserIndex >= 0
    ? normalized.slice(0, latestUserIndex)
    : normalized;
  const coveredUntilTimestamp = Number(memory?.coveredUntilTimestamp) || 0;
  const unsummarized = historyBeforeLatestUser.filter(
    (message) => message.timestamp > coveredUntilTimestamp,
  );
  const keepRecentCount = Math.max(1, Number(options.keepRecentCount) || KEEP_RECENT_COUNT);
  const recentMessages = unsummarized.slice(-keepRecentCount);
  const transitionMessages = unsummarized.slice(0, Math.max(0, unsummarized.length - keepRecentCount));

  return {
    latestUserMessage,
    recentMessages,
    transitionMessages,
    summaryText: toText(memory?.summaryText, "").trim(),
    coveredUntilTimestamp,
  };
}

function trimRecentMessagesToBudget(parts, options = {}) {
  const modelName = toText(options.modelName, "gpt-4o-mini");
  const systemPrompt = toText(options.systemPrompt, "");
  const skillPatch = toText(options.skillPatch, "");
  const reservedToolTokens = Number.isFinite(Number(options.reservedToolTokens))
    ? Math.max(0, Math.floor(Number(options.reservedToolTokens)))
    : DEFAULT_RESERVED_TOOL_TOKENS;

  const recentMessages = [...parts.recentMessages];
  const transitionMessages = [...parts.transitionMessages];
  let historyMessages = [...transitionMessages, ...recentMessages];
  let historyText = transcriptFromMessages(historyMessages);
  let estimate = estimatePromptTokens({
    modelName,
    systemPrompt,
    skillPatch,
    summaryText: parts.summaryText,
    historyText,
    latestUserText: parts.latestUserMessage,
    reservedToolTokens,
  });

  while (historyMessages.length > 0 && estimate.estimatedTotalTokens > estimate.inputBudgetTokens) {
    historyMessages.shift();
    historyText = transcriptFromMessages(historyMessages);
    estimate = estimatePromptTokens({
      modelName,
      systemPrompt,
      skillPatch,
      summaryText: parts.summaryText,
      historyText,
      latestUserText: parts.latestUserMessage,
      reservedToolTokens,
    });
  }

  return {
    ...parts,
    historyMessages,
    historyText,
    tokenEstimate: estimate,
  };
}

function buildChatPrompt(parts) {
  return [
    "你将收到三部分内容：长期摘要、最近历史、当前用户最新消息。",
    "请严格以【当前用户最新消息】为本轮唯一要解决的问题。",
    "长期摘要用于保留稳定目标、约束和用户偏好。",
    "最近历史用于理解当前执行状态。",
    "如果长期摘要与最近历史冲突，以最近历史为准。",
    "如果最近历史与当前用户最新消息冲突，以当前用户最新消息为准。",
    "在有助于可读性时，请使用 Markdown 输出。",
    "",
    "【长期摘要（仅供参考）】",
    parts.summaryText || "(无摘要)",
    "",
    "【最近历史（仅供参考）】",
    parts.historyText || "(无历史对话)",
    "",
    "【当前用户最新消息（本轮必须回答）】",
    parts.latestUserMessage || "(未检测到用户消息)",
  ].join("\n");
}

function buildPromptWithBudget(messages = [], memory = {}, options = {}) {
  const split = splitChatHistory(messages, memory, options);
  const trimmed = trimRecentMessagesToBudget(split, options);
  const prompt = buildChatPrompt(trimmed);
  const transitionText = transcriptFromMessages(trimmed.transitionMessages);
  const transitionTokens = countTextTokens(transitionText, options.modelName);
  const summaryTokens = countTextTokens(trimmed.summaryText, options.modelName);

  return {
    prompt,
    latestUserMessage: trimmed.latestUserMessage,
    summaryText: trimmed.summaryText,
    summaryTokens,
    transitionMessages: trimmed.transitionMessages,
    recentMessages: trimmed.recentMessages,
    historyMessages: trimmed.historyMessages,
    historyText: trimmed.historyText,
    transitionText,
    transitionTokens,
    tokenEstimate: trimmed.tokenEstimate,
  };
}

function buildSummaryRefreshState(messages = [], memory = {}, options = {}) {
  const normalized = normalizeMessages(messages);
  const coveredUntilTimestamp = Number(memory?.coveredUntilTimestamp) || 0;
  const unsummarized = normalized.filter(
    (message) => message.timestamp > coveredUntilTimestamp,
  );
  const keepRecentCount = Math.max(1, Number(options.keepRecentCount) || KEEP_RECENT_COUNT);
  const recentMessages = unsummarized.slice(-keepRecentCount);
  const transitionMessages = unsummarized.slice(0, Math.max(0, unsummarized.length - keepRecentCount));
  const transitionText = transcriptFromMessages(transitionMessages);
  return {
    summaryText: toText(memory?.summaryText, "").trim(),
    recentMessages,
    transitionMessages,
    transitionText,
    transitionTokens: countTextTokens(transitionText, options.modelName),
  };
}

function shouldRefreshSummary(context) {
  const transitionTokens = Number(context?.transitionTokens) || 0;
  return transitionTokens >= MIN_SUMMARY_BATCH_TOKENS || transitionTokens >= MAX_TRANSITION_TOKENS;
}

module.exports = {
  KEEP_RECENT_COUNT,
  MIN_SUMMARY_BATCH_TOKENS,
  MAX_TRANSITION_TOKENS,
  MAX_SUMMARY_TOKENS,
  transcriptFromMessages,
  splitChatHistory,
  buildPromptWithBudget,
  buildSummaryRefreshState,
  shouldRefreshSummary,
};
