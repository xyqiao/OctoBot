const fs = require("fs/promises");
const path = require("path");
const { toSafeString, toFiniteInt } = require("./common.cjs");

const DEFAULT_TEXT_LIMIT = 120_000;

function clipText(text, maxChars = DEFAULT_TEXT_LIMIT) {
  const source = toSafeString(text, "");
  const limit = toFiniteInt(maxChars, DEFAULT_TEXT_LIMIT, {
    min: 512,
    max: 2_000_000,
  });
  if (source.length <= limit) {
    return {
      text: source,
      truncated: false,
      totalChars: source.length,
    };
  }

  return {
    text: `${source.slice(0, limit)}\n\n...[truncated]`,
    truncated: true,
    totalChars: source.length,
  };
}

async function ensureParentDirectory(filePath) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
}

module.exports = {
  DEFAULT_TEXT_LIMIT,
  clipText,
  ensureParentDirectory,
};
