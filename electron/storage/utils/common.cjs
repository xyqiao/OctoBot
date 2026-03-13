/**
 * Common utility functions for storage layer
 */

function now() {
  return Date.now();
}

function makeId(prefix) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
}

function parseJsonSafe(raw, fallback) {
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function summarizeChatTitle(content) {
  const raw = String(content ?? "")
    .replace(/\s+/g, " ")
    .trim();

  if (!raw) {
    return "新对话";
  }

  const cleaned = raw.replace(/^[#>*`\-+\d.)\s]+/, "").trim();
  const firstSentence = cleaned.split(/[\n。！？!?；;]+/)[0]?.trim() || cleaned;
  const maxLen = /[^\x00-\x7f]/.test(firstSentence) ? 16 : 36;

  if (firstSentence.length <= maxLen) {
    return firstSentence;
  }

  return `${firstSentence.slice(0, maxLen).trim()}...`;
}

module.exports = {
  now,
  makeId,
  parseJsonSafe,
  summarizeChatTitle,
};
