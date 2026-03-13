/**
 * Text processing utilities for runtime layer
 */

export function toText(content) {
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

export function chunkText(answer, chunkSize = 160) {
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

export function summarizeJson(value, maxLen = 240) {
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

export function normalizeText(value) {
  return toText(value).toLowerCase();
}

export function normalizeSignalText(value) {
  return normalizeText(value).replace(/\s+/g, " ").trim();
}

export function uniqueStrings(values = []) {
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

export function extractPlanText(message) {
  const content = toText(message?.content || "");
  if (!content) {
    return "";
  }

  const lines = content.split("\n");
  const planLines = [];
  let inPlan = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.match(/^#+\s*(执行计划|计划|步骤)/i)) {
      inPlan = true;
      continue;
    }
    if (inPlan && trimmed.match(/^#+\s/)) {
      break;
    }
    if (inPlan && trimmed) {
      planLines.push(trimmed);
    }
  }

  return planLines.join("\n") || content.slice(0, 500);
}
