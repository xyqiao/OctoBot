const { encodingForModel, getEncoding } = require("js-tiktoken");

const DEFAULT_CONTEXT_LIMIT = 128_000;
const DEFAULT_INPUT_BUDGET_RATIO = 0.4;
const DEFAULT_RESERVED_TOOL_TOKENS = 1_800;
const MODEL_CONTEXT_LIMIT_MAP = [
  { prefix: "gpt-4o", limit: 128_000 },
  { prefix: "gpt-4.1", limit: 128_000 },
  { prefix: "o1", limit: 200_000 },
  { prefix: "o3", limit: 200_000 },
];

const encodingCache = new Map();

function toText(value, fallback = "") {
  if (typeof value === "string") {
    return value;
  }
  if (value === undefined || value === null) {
    return fallback;
  }
  return String(value);
}

function normalizeModelName(modelName) {
  return toText(modelName, "gpt-4o-mini").trim().toLowerCase() || "gpt-4o-mini";
}

function resolveEncodingName(modelName) {
  const normalized = normalizeModelName(modelName);

  try {
    return encodingForModel(normalized);
  } catch {
    return "o200k_base";
  }
}

function getEncoder(modelName) {
  const encodingName = resolveEncodingName(modelName);
  if (!encodingCache.has(encodingName)) {
    encodingCache.set(encodingName, getEncoding(encodingName));
  }
  return encodingCache.get(encodingName);
}

function countTextTokens(text, modelName) {
  const content = toText(text, "");
  if (!content) {
    return 0;
  }
  const encoder = getEncoder(modelName);
  return encoder.encode(content).length;
}

function countMessagesTokens(messages, modelName) {
  if (!Array.isArray(messages) || messages.length === 0) {
    return 0;
  }

  return messages.reduce((total, message) => {
    const role = toText(message?.role, "");
    const content = toText(message?.content, "");
    return total + countTextTokens(`${role}\n${content}`, modelName);
  }, 0);
}

function getModelContextLimit(modelName) {
  const normalized = normalizeModelName(modelName);
  const matched = MODEL_CONTEXT_LIMIT_MAP.find((item) => normalized.startsWith(item.prefix));
  return matched?.limit || DEFAULT_CONTEXT_LIMIT;
}

function getInputBudgetTokens(modelName, options = {}) {
  const ratio = Number(options.ratio);
  const safeRatio = Number.isFinite(ratio) && ratio > 0 && ratio < 1
    ? ratio
    : DEFAULT_INPUT_BUDGET_RATIO;
  const contextLimit = getModelContextLimit(modelName);
  return Math.max(4_000, Math.floor(contextLimit * safeRatio));
}

function estimatePromptTokens(options = {}) {
  const modelName = normalizeModelName(options.modelName);
  const reservedToolTokens = Number.isFinite(Number(options.reservedToolTokens))
    ? Math.max(0, Math.floor(Number(options.reservedToolTokens)))
    : DEFAULT_RESERVED_TOOL_TOKENS;

  const contentTokens = [
    toText(options.systemPrompt, ""),
    toText(options.skillPatch, ""),
    toText(options.summaryText, ""),
    toText(options.historyText, ""),
    toText(options.latestUserText, ""),
  ].reduce((total, item) => total + countTextTokens(item, modelName), 0);

  return {
    contentTokens,
    reservedToolTokens,
    estimatedTotalTokens: contentTokens + reservedToolTokens,
    inputBudgetTokens: getInputBudgetTokens(modelName, options),
  };
}

module.exports = {
  DEFAULT_RESERVED_TOOL_TOKENS,
  DEFAULT_INPUT_BUDGET_RATIO,
  normalizeModelName,
  countTextTokens,
  countMessagesTokens,
  getModelContextLimit,
  getInputBudgetTokens,
  estimatePromptTokens,
};
