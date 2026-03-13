const fs = require("fs/promises");
const path = require("path");
const { ensureParentDirectory } = require("./fileUtils.cjs");
const { toSafeString } = require("./common.cjs");

const DEFAULT_AUDIT_LOG_PATH = path.resolve(
  process.cwd(),
  "logs",
  "agent-tools-audit.ndjson",
);

function summarizeForAudit(value, depth = 0) {
  if (depth > 3) {
    return "[MaxDepth]";
  }

  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value === "string") {
    if (value.length > 240) {
      return `${value.slice(0, 240)}...(truncated)`;
    }
    return value;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  if (Array.isArray(value)) {
    return value.slice(0, 20).map((item) => summarizeForAudit(item, depth + 1));
  }

  if (typeof value === "object") {
    const entries = Object.entries(value).slice(0, 30);
    const result = {};
    for (const [key, item] of entries) {
      const lowerKey = key.toLowerCase();
      if (
        lowerKey.includes("password") ||
        lowerKey.includes("token") ||
        lowerKey.includes("secret") ||
        lowerKey.includes("apikey")
      ) {
        result[key] = "[REDACTED]";
      } else {
        result[key] = summarizeForAudit(item, depth + 1);
      }
    }
    return result;
  }

  return toSafeString(value, "");
}

async function appendAuditRecord(context, record) {
  const logPath = toSafeString(context?.auditLogPath, DEFAULT_AUDIT_LOG_PATH);
  const payload = {
    ts: Date.now(),
    ...record,
  };

  try {
    await ensureParentDirectory(logPath);
    await fs.appendFile(logPath, `${JSON.stringify(payload)}\n`, { encoding: "utf8" });
  } catch {
    // Do not break tool execution due to audit file IO errors.
  }
}

module.exports = {
  DEFAULT_AUDIT_LOG_PATH,
  summarizeForAudit,
  appendAuditRecord,
};
