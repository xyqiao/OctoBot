/**
 * Validation and normalization functions for storage layer
 */

// Constants
const taskTypes = new Set(["agent_task"]);
const taskLifecycleStatuses = new Set([
  "draft",
  "active",
  "paused",
  "terminated",
]);
const taskScheduleTypes = new Set(["manual", "once", "cron"]);
const taskRunStatuses = new Set([
  "queued",
  "running",
  "succeeded",
  "failed",
  "canceled",
  "timeout",
]);
const taskTriggerTypes = new Set(["manual", "schedule", "retry"]);

// Normalization functions
function normalizeTaskType(value) {
  const normalized = String(value || "agent_task").trim();
  return taskTypes.has(normalized) ? normalized : "agent_task";
}

function normalizeLifecycleStatus(value) {
  const normalized = String(value ?? "active").trim();
  return taskLifecycleStatuses.has(normalized) ? normalized : "active";
}

function normalizeScheduleType(value) {
  const normalized = String(value ?? "manual").trim();
  return taskScheduleTypes.has(normalized) ? normalized : "manual";
}

function normalizeRunStatus(value) {
  const normalized = String(value ?? "queued").trim();
  return taskRunStatuses.has(normalized) ? normalized : "queued";
}

function normalizeTriggerType(value) {
  const normalized = String(value ?? "manual").trim();
  return taskTriggerTypes.has(normalized) ? normalized : "manual";
}

function normalizeNonEmptyText(value, fallback) {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function normalizeOptionalText(value) {
  const text = String(value ?? "").trim();
  return text || null;
}

function normalizeTimestamp(value, fallback = null) {
  if (value === null || value === undefined || value === "") {
    return fallback;
  }
  const timestamp = Number(value);
  if (!Number.isFinite(timestamp)) {
    return fallback;
  }
  return Math.floor(timestamp);
}

function normalizeJson(value, fallback = {}) {
  if (value === undefined) {
    return JSON.stringify(fallback);
  }

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return JSON.stringify(parsed);
    } catch {
      return JSON.stringify({ value });
    }
  }

  return JSON.stringify(value);
}

function normalizeTimezone(value) {
  return normalizeNonEmptyText(value, "Asia/Shanghai");
}

module.exports = {
  taskTypes,
  taskLifecycleStatuses,
  taskScheduleTypes,
  taskRunStatuses,
  taskTriggerTypes,
  normalizeTaskType,
  normalizeLifecycleStatus,
  normalizeScheduleType,
  normalizeRunStatus,
  normalizeTriggerType,
  normalizeNonEmptyText,
  normalizeOptionalText,
  normalizeTimestamp,
  normalizeJson,
  normalizeTimezone,
};
