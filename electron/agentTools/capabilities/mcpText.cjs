const { toSafeString } = require("./common.cjs");

function extractMcpTextContent(result) {
  const structured = toSafeString(result?.structuredContent?.content, "");
  if (structured) {
    return structured;
  }

  const contentParts = Array.isArray(result?.content) ? result.content : [];
  return contentParts
    .map((part) => toSafeString(part?.text, "").trim())
    .filter(Boolean)
    .join("\n");
}

function assertMcpToolSuccess(result, toolName) {
  if (!result || typeof result !== "object") {
    return;
  }
  if (!result.isError) {
    return;
  }

  const text = extractMcpTextContent(result);
  throw new Error(
    text ||
      `Filesystem MCP 工具 "${toSafeString(toolName, "unknown")}" 返回了错误。`,
  );
}

module.exports = {
  extractMcpTextContent,
  assertMcpToolSuccess,
};
