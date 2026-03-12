const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");

const defaultSettings = {
  id: "user-settings",
  displayName: "John Doe",
  email: "",
  role: "Lead Data Scientist",
  modelName: "gpt-4o-mini",
  baseUrl: "",
  apiKey: "",
  langsmithEnabled: false,
  langsmithApiKey: "",
  langsmithProject: "",
  langsmithEndpoint: "",
  themeMode: "light",
  desktopNotifications: true,
  developerLogging: false,
  dataTelemetry: true,
};

function now() {
  return Date.now();
}

function makeId(prefix) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
}

function toChat(row) {
  return {
    id: row.id,
    title: row.title,
    updatedAt: row.updated_at,
  };
}

function toMessage(row) {
  return {
    id: row.id,
    chatId: row.chat_id,
    role: row.role,
    content: row.content,
    timestamp: row.timestamp,
  };
}

function toChatMemory(row) {
  if (!row) {
    return null;
  }

  return {
    chatId: row.chat_id,
    summaryText: row.summary_text,
    coveredUntilTimestamp: row.covered_until_timestamp,
    updatedAt: row.updated_at,
  };
}

function toTask(row) {
  let logs = [];
  try {
    logs = JSON.parse(row.logs || "[]");
  } catch {
    logs = [];
  }

  return {
    id: row.id,
    title: row.title,
    status: row.status,
    progress: row.progress,
    logs,
    updatedAt: row.updated_at,
    subtitle: row.subtitle ?? undefined,
  };
}

function parseJsonSafe(raw, fallback) {
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function toTaskDefinition(row) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    taskType: row.task_type,
    payload: parseJsonSafe(row.payload_json || "{}", {}),
    lifecycleStatus: row.lifecycle_status,
    schedule: row.schedule_type
      ? {
          type: row.schedule_type,
          runAt: row.run_at ?? undefined,
          cronExpr: row.cron_expr ?? undefined,
          timezone: row.timezone ?? "Asia/Shanghai",
          nextRunAt: row.next_run_at ?? undefined,
          lastRunAt: row.last_run_at ?? undefined,
        }
      : {
          type: "manual",
          timezone: "Asia/Shanghai",
        },
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toTaskRun(row) {
  return {
    id: row.id,
    taskId: row.task_id,
    triggerType: row.trigger_type,
    status: row.status,
    queuedAt: row.queued_at,
    startedAt: row.started_at ?? undefined,
    endedAt: row.ended_at ?? undefined,
    progress: row.progress,
    workerId: row.worker_id ?? undefined,
    cancelRequested: Boolean(row.cancel_requested),
    result: parseJsonSafe(row.result_json || "{}", {}),
    errorCode: row.error_code ?? undefined,
    errorMessage: row.error_message ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toTaskRunLog(row) {
  return {
    id: row.id,
    runId: row.run_id,
    ts: row.ts,
    level: row.level,
    phase: row.phase,
    message: row.message,
    meta: parseJsonSafe(row.meta_json || "{}", {}),
  };
}

function toSettings(row) {
  if (!row) {
    return defaultSettings;
  }

  return {
    id: row.id,
    displayName: row.display_name,
    email: row.email,
    role: row.role,
    modelName: row.model_name || defaultSettings.modelName,
    baseUrl: row.base_url || "",
    apiKey: row.api_key || "",
    langsmithEnabled: Boolean(row.langsmith_enabled),
    langsmithApiKey: row.langsmith_api_key || "",
    langsmithProject: row.langsmith_project || "",
    langsmithEndpoint: row.langsmith_endpoint || "",
    themeMode: row.theme_mode === "dark" ? "dark" : "light",
    desktopNotifications: Boolean(row.desktop_notifications),
    developerLogging: Boolean(row.developer_logging),
    dataTelemetry: Boolean(row.data_telemetry),
  };
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

function normalizeTaskSchedule(input, createdAt) {
  const schedule = input && typeof input === "object" ? input : {};
  const type = normalizeScheduleType(schedule.type);
  const timezone = normalizeTimezone(schedule.timezone);

  if (type === "once") {
    const runAt = normalizeTimestamp(schedule.runAt, createdAt);
    return {
      type,
      runAt,
      cronExpr: null,
      timezone,
      nextRunAt: runAt,
      lastRunAt: null,
    };
  }

  if (type === "cron") {
    const cronExpr = normalizeOptionalText(schedule.cronExpr);
    const nextRunAt = cronExpr
      ? computeNextCronRunAt(cronExpr, createdAt)
      : null;
    return {
      type,
      runAt: null,
      cronExpr,
      timezone,
      nextRunAt,
      lastRunAt: null,
    };
  }

  return {
    type: "manual",
    runAt: null,
    cronExpr: null,
    timezone,
    nextRunAt: null,
    lastRunAt: null,
  };
}

function nextMinuteBoundary(timestamp) {
  const date = new Date(timestamp);
  date.setSeconds(0, 0);
  date.setMinutes(date.getMinutes() + 1);
  return date.getTime();
}

function withMinute(date, minute) {
  const copy = new Date(date.getTime());
  copy.setSeconds(0, 0);
  copy.setMinutes(minute);
  return copy;
}

function withHourMinute(date, hour, minute) {
  const copy = new Date(date.getTime());
  copy.setSeconds(0, 0);
  copy.setHours(hour, minute, 0, 0);
  return copy;
}

function computeNextCronRunAt(cronExpr, fromTimestamp) {
  const expr = String(cronExpr ?? "").trim();
  if (!expr) {
    return null;
  }

  const parts = expr.split(/\s+/);
  if (parts.length !== 5) {
    return null;
  }

  const [minutePart, hourPart, dayOfMonth, month, dayOfWeek] = parts;
  if (dayOfMonth !== "*" || month !== "*" || dayOfWeek !== "*") {
    return null;
  }

  const nowDate = new Date(fromTimestamp);

  // Supports: */N * * * *
  if (/^\*\/\d+$/.test(minutePart) && hourPart === "*") {
    const step = Number(minutePart.slice(2));
    if (!Number.isInteger(step) || step < 1 || step > 59) {
      return null;
    }

    const candidate = nextMinuteBoundary(fromTimestamp);
    const candidateDate = new Date(candidate);
    const minute = candidateDate.getMinutes();
    const delta = minute % step === 0 ? 0 : step - (minute % step);
    candidateDate.setMinutes(minute + delta, 0, 0);
    return candidateDate.getTime();
  }

  // Supports: M * * * *
  if (/^\d{1,2}$/.test(minutePart) && hourPart === "*") {
    const minute = Number(minutePart);
    if (minute < 0 || minute > 59) {
      return null;
    }
    let candidate = withMinute(nowDate, minute);
    if (candidate.getTime() <= fromTimestamp) {
      candidate = new Date(candidate.getTime() + 60 * 60_000);
      candidate = withMinute(candidate, minute);
    }
    return candidate.getTime();
  }

  // Supports: M H * * *
  if (/^\d{1,2}$/.test(minutePart) && /^\d{1,2}$/.test(hourPart)) {
    const minute = Number(minutePart);
    const hour = Number(hourPart);
    if (minute < 0 || minute > 59 || hour < 0 || hour > 23) {
      return null;
    }
    let candidate = withHourMinute(nowDate, hour, minute);
    if (candidate.getTime() <= fromTimestamp) {
      candidate = new Date(candidate.getTime() + 24 * 60 * 60_000);
      candidate = withHourMinute(candidate, hour, minute);
    }
    return candidate.getTime();
  }

  return null;
}

function ensureSchema(db) {
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  db.exec(`
    CREATE TABLE IF NOT EXISTS chats (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      chat_id TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
      content TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_messages_chat_time ON messages(chat_id, timestamp);
    CREATE INDEX IF NOT EXISTS idx_chats_updated_at ON chats(updated_at DESC);

    CREATE TABLE IF NOT EXISTS chat_memory (
      chat_id TEXT PRIMARY KEY,
      summary_text TEXT NOT NULL,
      covered_until_timestamp INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      subtitle TEXT,
      status TEXT NOT NULL,
      progress INTEGER NOT NULL,
      logs TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_tasks_updated_at ON tasks(updated_at DESC);

    CREATE TABLE IF NOT EXISTS task_definition (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      task_type TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      lifecycle_status TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS task_schedule (
      task_id TEXT PRIMARY KEY,
      schedule_type TEXT NOT NULL,
      run_at INTEGER,
      cron_expr TEXT,
      timezone TEXT NOT NULL DEFAULT 'Asia/Shanghai',
      next_run_at INTEGER,
      last_run_at INTEGER,
      FOREIGN KEY (task_id) REFERENCES task_definition(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS task_run (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      trigger_type TEXT NOT NULL,
      status TEXT NOT NULL,
      queued_at INTEGER NOT NULL,
      started_at INTEGER,
      ended_at INTEGER,
      progress INTEGER NOT NULL DEFAULT 0,
      worker_id TEXT,
      cancel_requested INTEGER NOT NULL DEFAULT 0,
      result_json TEXT NOT NULL DEFAULT '{}',
      error_code TEXT,
      error_message TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (task_id) REFERENCES task_definition(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS agent_run (
      id TEXT PRIMARY KEY,
      task_run_id TEXT NOT NULL,
      trace_id TEXT,
      status TEXT NOT NULL,
      summary TEXT,
      started_at INTEGER,
      ended_at INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (task_run_id) REFERENCES task_run(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS agent_step (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_run_id TEXT NOT NULL,
      agent_name TEXT NOT NULL,
      step_index INTEGER NOT NULL,
      input_text TEXT,
      output_text TEXT,
      status TEXT NOT NULL,
      ts INTEGER NOT NULL,
      meta_json TEXT NOT NULL DEFAULT '{}',
      FOREIGN KEY (agent_run_id) REFERENCES agent_run(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS tool_call (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_run_id TEXT NOT NULL,
      tool_name TEXT NOT NULL,
      input_json TEXT NOT NULL DEFAULT '{}',
      output_json TEXT NOT NULL DEFAULT '{}',
      status TEXT NOT NULL,
      elapsed_ms INTEGER,
      ts INTEGER NOT NULL,
      FOREIGN KEY (agent_run_id) REFERENCES agent_run(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS artifact (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_run_id TEXT NOT NULL,
      type TEXT NOT NULL,
      path TEXT NOT NULL,
      meta_json TEXT NOT NULL DEFAULT '{}',
      created_at INTEGER NOT NULL,
      FOREIGN KEY (agent_run_id) REFERENCES agent_run(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_agent_run_task ON agent_run(task_run_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_agent_step_run ON agent_step(agent_run_id, ts);
    CREATE INDEX IF NOT EXISTS idx_tool_call_run ON tool_call(agent_run_id, ts);
    CREATE INDEX IF NOT EXISTS idx_artifact_run ON artifact(agent_run_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS task_run_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id TEXT NOT NULL,
      ts INTEGER NOT NULL,
      level TEXT NOT NULL,
      phase TEXT NOT NULL,
      message TEXT NOT NULL,
      meta_json TEXT NOT NULL DEFAULT '{}',
      FOREIGN KEY (run_id) REFERENCES task_run(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS task_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id TEXT NOT NULL UNIQUE,
      available_at INTEGER NOT NULL,
      priority INTEGER NOT NULL DEFAULT 100,
      lease_owner TEXT,
      lease_expires_at INTEGER,
      status TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (run_id) REFERENCES task_run(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_task_def_status ON task_definition(lifecycle_status, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_task_sched_next ON task_schedule(next_run_at);
    CREATE INDEX IF NOT EXISTS idx_task_run_task ON task_run(task_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_task_run_status ON task_run(status, queued_at);
    CREATE INDEX IF NOT EXISTS idx_task_log_run ON task_run_log(run_id, ts);
    CREATE INDEX IF NOT EXISTS idx_task_queue_pick ON task_queue(status, available_at, priority);

    CREATE TABLE IF NOT EXISTS settings (
      id TEXT PRIMARY KEY,
      display_name TEXT NOT NULL,
      email TEXT NOT NULL,
      role TEXT NOT NULL,
      model_name TEXT NOT NULL,
      base_url TEXT NOT NULL,
      api_key TEXT NOT NULL,
      langsmith_enabled INTEGER NOT NULL,
      langsmith_api_key TEXT NOT NULL,
      langsmith_project TEXT NOT NULL,
      langsmith_endpoint TEXT NOT NULL,
      theme_mode TEXT NOT NULL,
      desktop_notifications INTEGER NOT NULL,
      developer_logging INTEGER NOT NULL,
      data_telemetry INTEGER NOT NULL
    );
  `);

  const columns = db
    .prepare("PRAGMA table_info(settings)")
    .all()
    .map((col) => col.name);
  const expectedSettingsColumns = [
    "id",
    "display_name",
    "email",
    "role",
    "model_name",
    "base_url",
    "api_key",
    "langsmith_enabled",
    "langsmith_api_key",
    "langsmith_project",
    "langsmith_endpoint",
    "theme_mode",
    "desktop_notifications",
    "developer_logging",
    "data_telemetry",
  ];

  const hasSchemaMismatch =
    columns.length !== expectedSettingsColumns.length ||
    expectedSettingsColumns.some((column) => !columns.includes(column));

  // Project is pre-release: if schema mismatches, reset settings table to the current shape.
  if (hasSchemaMismatch) {
    db.exec(`
      DROP TABLE IF EXISTS settings;
      CREATE TABLE settings (
        id TEXT PRIMARY KEY,
        display_name TEXT NOT NULL,
        email TEXT NOT NULL,
        role TEXT NOT NULL,
        model_name TEXT NOT NULL,
        base_url TEXT NOT NULL,
        api_key TEXT NOT NULL,
        langsmith_enabled INTEGER NOT NULL,
        langsmith_api_key TEXT NOT NULL,
        langsmith_project TEXT NOT NULL,
        langsmith_endpoint TEXT NOT NULL,
        theme_mode TEXT NOT NULL,
        desktop_notifications INTEGER NOT NULL,
        developer_logging INTEGER NOT NULL,
        data_telemetry INTEGER NOT NULL
      );
    `);
  }
}

function createStorage(userDataDir) {
  fs.mkdirSync(userDataDir, { recursive: true });
  const dbPath = path.join(userDataDir, "nexus-ai.sqlite");
  const db = new Database(dbPath);
  let closed = false;

  ensureSchema(db);

  const queries = {
    countChats: db.prepare("SELECT COUNT(1) AS count FROM chats"),
    countTasks: db.prepare("SELECT COUNT(1) AS count FROM tasks"),
    getSettings: db.prepare("SELECT * FROM settings WHERE id = ?"),
    getChatById: db.prepare("SELECT * FROM chats WHERE id = ?"),
    getChatMemoryByChatId: db.prepare(
      "SELECT * FROM chat_memory WHERE chat_id = ?",
    ),
    insertChat: db.prepare(
      "INSERT INTO chats (id, title, updated_at) VALUES (@id, @title, @updatedAt)",
    ),
    insertMessage: db.prepare(
      "INSERT INTO messages (id, chat_id, role, content, timestamp) VALUES (@id, @chatId, @role, @content, @timestamp)",
    ),
    countUserMessagesByChat: db.prepare(
      "SELECT COUNT(1) AS count FROM messages WHERE chat_id = ? AND role = 'user'",
    ),
    listChats: db.prepare("SELECT * FROM chats ORDER BY updated_at DESC"),
    listMessagesByChat: db.prepare(
      "SELECT * FROM messages WHERE chat_id = ? ORDER BY timestamp ASC",
    ),
    upsertChatMemory: db.prepare(
      "INSERT INTO chat_memory (chat_id, summary_text, covered_until_timestamp, updated_at) VALUES (@chatId, @summaryText, @coveredUntilTimestamp, @updatedAt) ON CONFLICT(chat_id) DO UPDATE SET summary_text = excluded.summary_text, covered_until_timestamp = excluded.covered_until_timestamp, updated_at = excluded.updated_at",
    ),
    updateChatTime: db.prepare("UPDATE chats SET updated_at = ? WHERE id = ?"),
    updateChatTitle: db.prepare(
      "UPDATE chats SET title = ?, updated_at = ? WHERE id = ?",
    ),
    deleteChat: db.prepare("DELETE FROM chats WHERE id = ?"),
    listTasks: db.prepare("SELECT * FROM tasks ORDER BY updated_at DESC"),
    upsertTask: db.prepare(
      `INSERT INTO tasks (id, title, subtitle, status, progress, logs, updated_at)
       VALUES (@id, @title, @subtitle, @status, @progress, @logs, @updatedAt)
       ON CONFLICT(id) DO UPDATE SET
         title = excluded.title,
         subtitle = excluded.subtitle,
         status = excluded.status,
         progress = excluded.progress,
         logs = excluded.logs,
         updated_at = excluded.updated_at`,
    ),
    insertTaskDefinition: db.prepare(
      `INSERT INTO task_definition (
         id, title, description, task_type, payload_json, lifecycle_status, created_at, updated_at
       ) VALUES (
         @id, @title, @description, @taskType, @payloadJson, @lifecycleStatus, @createdAt, @updatedAt
       )`,
    ),
    updateTaskDefinitionUpdatedAt: db.prepare(
      "UPDATE task_definition SET updated_at = ? WHERE id = ?",
    ),
    updateTaskDefinitionLifecycleStatus: db.prepare(
      "UPDATE task_definition SET lifecycle_status = ?, updated_at = ? WHERE id = ?",
    ),
    getTaskDefinitionById: db.prepare(
      `SELECT
         d.id,
         d.title,
         d.description,
         d.task_type,
         d.payload_json,
         d.lifecycle_status,
         d.created_at,
         d.updated_at,
         s.schedule_type,
         s.run_at,
         s.cron_expr,
         s.timezone,
         s.next_run_at,
         s.last_run_at
       FROM task_definition d
       LEFT JOIN task_schedule s ON s.task_id = d.id
       WHERE d.id = ?`,
    ),
    listTaskDefinitions: db.prepare(
      `SELECT
         d.id,
         d.title,
         d.description,
         d.task_type,
         d.payload_json,
         d.lifecycle_status,
         d.created_at,
         d.updated_at,
         s.schedule_type,
         s.run_at,
         s.cron_expr,
         s.timezone,
         s.next_run_at,
         s.last_run_at
       FROM task_definition d
       LEFT JOIN task_schedule s ON s.task_id = d.id
       WHERE d.task_type = 'agent_task'
       ORDER BY d.updated_at DESC`,
    ),
    listDueTaskSchedules: db.prepare(
      `SELECT
         d.id AS task_id,
         s.schedule_type,
         s.cron_expr,
         s.timezone,
         s.next_run_at
       FROM task_definition d
       INNER JOIN task_schedule s ON s.task_id = d.id
       WHERE d.lifecycle_status = 'active'
         AND d.task_type = 'agent_task'
         AND s.schedule_type IN ('once', 'cron')
         AND s.next_run_at IS NOT NULL
         AND s.next_run_at <= ?
       ORDER BY s.next_run_at ASC
       LIMIT ?`,
    ),
    upsertTaskSchedule: db.prepare(
      `INSERT INTO task_schedule (
         task_id, schedule_type, run_at, cron_expr, timezone, next_run_at, last_run_at
       ) VALUES (
         @taskId, @scheduleType, @runAt, @cronExpr, @timezone, @nextRunAt, @lastRunAt
       )
       ON CONFLICT(task_id) DO UPDATE SET
         schedule_type = excluded.schedule_type,
         run_at = excluded.run_at,
         cron_expr = excluded.cron_expr,
         timezone = excluded.timezone,
         next_run_at = excluded.next_run_at,
         last_run_at = excluded.last_run_at`,
    ),
    updateTaskScheduleLastRunAt: db.prepare(
      "UPDATE task_schedule SET last_run_at = ? WHERE task_id = ?",
    ),
    updateTaskScheduleNextRunAt: db.prepare(
      "UPDATE task_schedule SET next_run_at = ? WHERE task_id = ?",
    ),
    updateTaskScheduleNextAndLastRunAt: db.prepare(
      "UPDATE task_schedule SET next_run_at = ?, last_run_at = ? WHERE task_id = ?",
    ),
    listCancelableTaskRunsByTask: db.prepare(
      `SELECT id, status
       FROM task_run
       WHERE task_id = ?
         AND status IN ('queued', 'running')
       ORDER BY created_at DESC`,
    ),
    insertTaskRun: db.prepare(
      `INSERT INTO task_run (
         id, task_id, trigger_type, status, queued_at, started_at, ended_at, progress, worker_id,
         cancel_requested, result_json, error_code, error_message, created_at, updated_at
       ) VALUES (
         @id, @taskId, @triggerType, @status, @queuedAt, @startedAt, @endedAt, @progress, @workerId,
         @cancelRequested, @resultJson, @errorCode, @errorMessage, @createdAt, @updatedAt
       )`,
    ),
    getTaskRunById: db.prepare("SELECT * FROM task_run WHERE id = ?"),
    listTaskRunsByTask: db.prepare(
      "SELECT * FROM task_run WHERE task_id = ? ORDER BY created_at DESC LIMIT ?",
    ),
    insertTaskRunLog: db.prepare(
      `INSERT INTO task_run_log (run_id, ts, level, phase, message, meta_json)
       VALUES (@runId, @ts, @level, @phase, @message, @metaJson)`,
    ),
    insertAgentRun: db.prepare(
      `INSERT INTO agent_run (
         id, task_run_id, trace_id, status, summary, started_at, ended_at, created_at, updated_at
       ) VALUES (
         @id, @taskRunId, @traceId, @status, @summary, @startedAt, @endedAt, @createdAt, @updatedAt
       )`,
    ),
    updateAgentRunStatus: db.prepare(
      `UPDATE agent_run
       SET status = ?, summary = ?, ended_at = ?, updated_at = ?
       WHERE id = ?`,
    ),
    insertAgentStep: db.prepare(
      `INSERT INTO agent_step (
         agent_run_id, agent_name, step_index, input_text, output_text, status, ts, meta_json
       ) VALUES (
         @agentRunId, @agentName, @stepIndex, @inputText, @outputText, @status, @ts, @metaJson
       )`,
    ),
    insertToolCall: db.prepare(
      `INSERT INTO tool_call (
         agent_run_id, tool_name, input_json, output_json, status, elapsed_ms, ts
       ) VALUES (
         @agentRunId, @toolName, @inputJson, @outputJson, @status, @elapsedMs, @ts
       )`,
    ),
    listAgentRunsByTaskRun: db.prepare(
      `SELECT * FROM agent_run WHERE task_run_id = ? ORDER BY created_at DESC`,
    ),
    listAgentStepsByRun: db.prepare(
      `SELECT * FROM agent_step WHERE agent_run_id = ? ORDER BY ts ASC`,
    ),
    listToolCallsByRun: db.prepare(
      `SELECT * FROM tool_call WHERE agent_run_id = ? ORDER BY ts ASC`,
    ),
    listTaskRunLogsByRun: db.prepare(
      "SELECT * FROM task_run_log WHERE run_id = ? ORDER BY ts ASC LIMIT ?",
    ),
    insertTaskQueue: db.prepare(
      `INSERT INTO task_queue (
         run_id, available_at, priority, lease_owner, lease_expires_at, status, created_at, updated_at
       ) VALUES (
         @runId, @availableAt, @priority, @leaseOwner, @leaseExpiresAt, @status, @createdAt, @updatedAt
       )`,
    ),
    getTaskQueueCandidate: db.prepare(
      `SELECT *
       FROM task_queue
       WHERE (
         (status = 'pending' AND available_at <= ?)
         OR
         (status = 'leased' AND lease_expires_at IS NOT NULL AND lease_expires_at <= ?)
       )
       ORDER BY priority ASC, available_at ASC, id ASC
       LIMIT 1`,
    ),
    leaseTaskQueueById: db.prepare(
      `UPDATE task_queue
       SET status = 'leased',
           lease_owner = ?,
           lease_expires_at = ?,
           updated_at = ?
       WHERE id = ?
         AND (
           (status = 'pending' AND available_at <= ?)
           OR
           (status = 'leased' AND lease_expires_at IS NOT NULL AND lease_expires_at <= ?)
         )`,
    ),
    releaseTaskQueueLeaseByRunId: db.prepare(
      `UPDATE task_queue
       SET status = 'pending',
           lease_owner = NULL,
           lease_expires_at = NULL,
           updated_at = ?
       WHERE run_id = ?
         AND status = 'leased'`,
    ),
    completeTaskQueueByRunId: db.prepare(
      `UPDATE task_queue
       SET status = 'done',
           lease_owner = NULL,
           lease_expires_at = NULL,
           updated_at = ?
       WHERE run_id = ?`,
    ),
    updateTaskRunStarted: db.prepare(
      `UPDATE task_run
       SET status = 'running',
           started_at = ?,
           updated_at = ?,
           worker_id = ?
       WHERE id = ?
         AND status = 'queued'`,
    ),
    updateTaskRunProgress: db.prepare(
      `UPDATE task_run
       SET progress = ?,
           updated_at = ?
       WHERE id = ?
         AND status = 'running'`,
    ),
    updateTaskRunSucceeded: db.prepare(
      `UPDATE task_run
       SET status = 'succeeded',
           progress = 100,
           ended_at = ?,
           updated_at = ?,
           result_json = ?,
           error_code = NULL,
           error_message = NULL
       WHERE id = ?
         AND status = 'running'`,
    ),
    updateTaskRunFailed: db.prepare(
      `UPDATE task_run
       SET status = 'failed',
           ended_at = ?,
           updated_at = ?,
           error_code = ?,
           error_message = ?
       WHERE id = ?
         AND status IN ('queued', 'running')`,
    ),
    updateTaskRunCancelRequested: db.prepare(
      `UPDATE task_run
       SET cancel_requested = 1,
           updated_at = ?
       WHERE id = ?
         AND status = 'running'`,
    ),
    updateTaskRunCanceled: db.prepare(
      `UPDATE task_run
       SET status = 'canceled',
           ended_at = ?,
           updated_at = ?,
           error_code = ?,
           error_message = ?
       WHERE id = ?
         AND status IN ('queued', 'running')`,
    ),
    getTaskExecutionPayloadByRunId: db.prepare(
      `SELECT
         r.id AS run_id,
         r.task_id,
         r.trigger_type,
         r.queued_at,
         d.title AS task_title,
         d.description AS task_description,
         d.task_type,
         d.payload_json
       FROM task_run r
       INNER JOIN task_definition d ON d.id = r.task_id
       WHERE r.id = ?`,
    ),
    upsertSettings: db.prepare(
      `INSERT INTO settings (
         id, display_name, email, role, model_name, base_url, api_key,
         langsmith_enabled, langsmith_api_key, langsmith_project, langsmith_endpoint,
         theme_mode, desktop_notifications, developer_logging, data_telemetry
       ) VALUES (
         @id, @displayName, @email, @role, @modelName, @baseUrl, @apiKey,
         @langsmithEnabled, @langsmithApiKey, @langsmithProject, @langsmithEndpoint,
         @themeMode, @desktopNotifications, @developerLogging, @dataTelemetry
       )
       ON CONFLICT(id) DO UPDATE SET
         display_name = excluded.display_name,
         email = excluded.email,
         role = excluded.role,
         model_name = excluded.model_name,
         base_url = excluded.base_url,
         api_key = excluded.api_key,
         langsmith_enabled = excluded.langsmith_enabled,
         langsmith_api_key = excluded.langsmith_api_key,
         langsmith_project = excluded.langsmith_project,
         langsmith_endpoint = excluded.langsmith_endpoint,
         theme_mode = excluded.theme_mode,
         desktop_notifications = excluded.desktop_notifications,
         developer_logging = excluded.developer_logging,
         data_telemetry = excluded.data_telemetry`,
    ),
  };

  function bootstrapData() {
    const chatCount = queries.countChats.get().count;
    const taskCount = queries.countTasks.get().count;
    const settings = queries.getSettings.get("user-settings");

    const seed = db.transaction(() => {
      if (chatCount === 0) {
        const chats = [
          {
            id: "chat_analytics",
            title: "Data Analysis Model",
            updatedAt: now(),
          },
          {
            id: "chat_refactor",
            title: "Code Refactoring",
            updatedAt: now() - 10 * 60_000,
          },
          {
            id: "chat_research",
            title: "Market Research",
            updatedAt: now() - 30 * 60_000,
          },
        ];

        for (const chat of chats) {
          queries.insertChat.run(chat);
        }

        const messages = [
          {
            id: makeId("msg"),
            chatId: "chat_analytics",
            role: "user",
            content:
              "Can you help me analyze the Q3 sales data and generate a trend report?",
            timestamp: now() - 4 * 60_000,
          },
          {
            id: makeId("msg"),
            chatId: "chat_analytics",
            role: "assistant",
            content:
              "Certainly! Please provide the dataset or connect to your database. I will analyze the metrics and identify key growth areas.",
            timestamp: now() - 4 * 60_000 + 2_000,
          },
          {
            id: makeId("msg"),
            chatId: "chat_analytics",
            role: "user",
            content:
              "I've attached the CSV file containing the regional breakdown.",
            timestamp: now() - 2 * 60_000,
          },
          {
            id: makeId("msg"),
            chatId: "chat_analytics",
            role: "assistant",
            content:
              "Processing the CSV file. Extracting column headers...\\n\\nFound 15 columns. Initiating data summarization protocol. This might take a few seconds.",
            timestamp: now() - 90_000,
          },
        ];

        for (const message of messages) {
          queries.insertMessage.run(message);
        }
      }

      if (taskCount === 0) {
        const tasks = [
          {
            id: "task_seo",
            title: "Generate Weekly SEO Report",
            subtitle: "Job ID: #TSK-8400 • Deployed on Cloud Node 03",
            status: "Running",
            progress: 45,
            updatedAt: now() - 120_000,
            logs: [
              "[INFO] - 10:02:11 - Initializing task execution engine.",
              "[INFO] - 10:02:12 - Loading modules: ['seo_analyzer', 'url_fetcher']",
              "[INFO] - 10:02:13 - Fetching target URLs... OK (24 ms)",
              "[DEBUG] - 10:02:14 - Running semantic keyword match. Waiting for response.",
            ],
          },
          {
            id: "task_crm",
            title: "Sync CRM data with Hubspot",
            status: "Pending",
            progress: 0,
            updatedAt: now() - 60 * 60_000,
            logs: [],
          },
          {
            id: "task_summary",
            title: "Summarize meeting transcripts",
            status: "Completed",
            progress: 100,
            updatedAt: now() - 26 * 60 * 60_000,
            logs: [
              "[INFO] - Completed summarization and exported digest to workspace.",
            ],
          },
        ];

        for (const task of tasks) {
          queries.upsertTask.run({
            ...task,
            subtitle: task.subtitle ?? null,
            logs: JSON.stringify(task.logs),
          });
        }
      }

      if (!settings) {
        queries.upsertSettings.run({
          ...defaultSettings,
          themeMode: defaultSettings.themeMode,
          langsmithEnabled: Number(defaultSettings.langsmithEnabled),
          langsmithApiKey: defaultSettings.langsmithApiKey,
          langsmithProject: defaultSettings.langsmithProject,
          langsmithEndpoint: defaultSettings.langsmithEndpoint,
          desktopNotifications: Number(defaultSettings.desktopNotifications),
          developerLogging: Number(defaultSettings.developerLogging),
          dataTelemetry: Number(defaultSettings.dataTelemetry),
        });
      }
    });

    seed();
    return true;
  }

  function listChats() {
    return queries.listChats.all().map(toChat);
  }

  function createChat() {
    const chat = {
      id: makeId("chat"),
      title: "新对话",
      updatedAt: now(),
    };

    queries.insertChat.run(chat);
    return chat;
  }

  function renameChat(chatId, title) {
    const normalizedTitle = String(title ?? "").trim();
    if (!normalizedTitle) {
      return false;
    }

    const updatedAt = now();
    const result = queries.updateChatTitle.run(
      normalizedTitle,
      updatedAt,
      chatId,
    );
    return result.changes > 0;
  }

  function deleteChat(chatId) {
    const result = queries.deleteChat.run(chatId);
    return result.changes > 0;
  }

  function getChatMessages(chatId) {
    return queries.listMessagesByChat.all(chatId).map(toMessage);
  }

  function getChatMemory(chatId) {
    return toChatMemory(queries.getChatMemoryByChatId.get(chatId));
  }

  function saveChatMemory(memory) {
    const normalized = {
      chatId: String(memory?.chatId || "").trim(),
      summaryText: String(memory?.summaryText || "").trim(),
      coveredUntilTimestamp: Number(memory?.coveredUntilTimestamp) || 0,
      updatedAt: Number(memory?.updatedAt) || Date.now(),
    };

    if (!normalized.chatId) {
      return false;
    }

    queries.upsertChatMemory.run(normalized);
    return true;
  }

  function appendMessage(message) {
    const txn = db.transaction(() => {
      const chatRow =
        message.role === "user"
          ? queries.getChatById.get(message.chatId)
          : null;
      const shouldRetitle =
        message.role === "user" &&
        chatRow?.title === "新对话" &&
        queries.countUserMessagesByChat.get(message.chatId).count === 0;

      queries.insertMessage.run(message);

      const updatedAt = Date.now();
      queries.updateChatTime.run(updatedAt, message.chatId);

      if (shouldRetitle) {
        const generatedTitle = summarizeChatTitle(message.content);
        queries.updateChatTitle.run(generatedTitle, updatedAt, message.chatId);
      }
    });
    txn();
    return true;
  }

  function listTasks() {
    return queries.listTasks.all().map(toTask);
  }

  function upsertTask(task) {
    queries.upsertTask.run({
      ...task,
      subtitle: task.subtitle ?? null,
      logs: JSON.stringify(task.logs ?? []),
    });
    return true;
  }

  function enqueueTaskRun(taskId, options = {}) {
    const timestamp = now();
    const runId = makeId("run");
    const triggerType = normalizeTriggerType(options.triggerType);
    const runStatus = normalizeRunStatus("queued");
    const priority = Number.isFinite(Number(options.priority))
      ? Math.max(1, Math.floor(Number(options.priority)))
      : 100;

    const queueRun = db.transaction(() => {
      queries.insertTaskRun.run({
        id: runId,
        taskId,
        triggerType,
        status: runStatus,
        queuedAt: timestamp,
        startedAt: null,
        endedAt: null,
        progress: 0,
        workerId: null,
        cancelRequested: 0,
        resultJson: JSON.stringify({}),
        errorCode: null,
        errorMessage: null,
        createdAt: timestamp,
        updatedAt: timestamp,
      });

      queries.insertTaskRunLog.run({
        runId,
        ts: timestamp,
        level: "info",
        phase: "queue",
        message: "Run queued and waiting for worker dispatch.",
        metaJson: JSON.stringify({ triggerType }),
      });

      queries.insertTaskQueue.run({
        runId,
        availableAt: timestamp,
        priority,
        leaseOwner: null,
        leaseExpiresAt: null,
        status: "pending",
        createdAt: timestamp,
        updatedAt: timestamp,
      });

      queries.updateTaskDefinitionUpdatedAt.run(timestamp, taskId);
      queries.updateTaskScheduleLastRunAt.run(timestamp, taskId);
    });

    queueRun();

    const run = queries.getTaskRunById.get(runId);
    return run ? toTaskRun(run) : null;
  }

  function cancelRunImmediately(runId, reason, timestamp = now()) {
    const code = "RUN_CANCELED";
    const message = normalizeNonEmptyText(reason, "Run canceled by operator.");
    const result = queries.updateTaskRunCanceled.run(
      timestamp,
      timestamp,
      code,
      message,
      runId,
    );

    if (result.changes === 0) {
      return false;
    }

    queries.completeTaskQueueByRunId.run(timestamp, runId);
    queries.insertTaskRunLog.run({
      runId,
      ts: timestamp,
      level: "warn",
      phase: "cancel",
      message,
      metaJson: JSON.stringify({ code }),
    });
    return true;
  }

  function createTaskDefinition(input = {}) {
    const normalizedInput = input && typeof input === "object" ? input : {};
    const timestamp = now();
    const taskId = normalizeNonEmptyText(normalizedInput.id, makeId("taskdef"));
    const schedule = normalizeTaskSchedule(normalizedInput.schedule, timestamp);

    const payload = {
      id: taskId,
      title: normalizeNonEmptyText(normalizedInput.title, "未命名任务"),
      description: normalizeNonEmptyText(normalizedInput.description, ""),
      taskType: normalizeTaskType(normalizedInput.taskType),
      payloadJson: normalizeJson(normalizedInput.payload, {}),
      lifecycleStatus: normalizeLifecycleStatus(
        normalizedInput.lifecycleStatus,
      ),
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    const insertTask = db.transaction(() => {
      queries.insertTaskDefinition.run(payload);
      queries.upsertTaskSchedule.run({
        taskId,
        scheduleType: schedule.type,
        runAt: schedule.runAt,
        cronExpr: schedule.cronExpr,
        timezone: schedule.timezone,
        nextRunAt: schedule.nextRunAt,
        lastRunAt: schedule.lastRunAt,
      });
    });

    insertTask();

    const created = queries.getTaskDefinitionById.get(taskId);
    return created ? toTaskDefinition(created) : null;
  }

  function listTaskDefinitions() {
    return queries.listTaskDefinitions.all().map(toTaskDefinition);
  }

  function runTaskNow(taskId, options = {}) {
    const runOptions = options && typeof options === "object" ? options : {};
    const task = queries.getTaskDefinitionById.get(taskId);
    if (!task) {
      return null;
    }

    if (task.lifecycle_status === "terminated") {
      throw new Error("Cannot run a terminated task.");
    }

    if (task.lifecycle_status === "paused") {
      throw new Error(
        "Cannot run a paused task. Start the task before running.",
      );
    }

    return enqueueTaskRun(taskId, runOptions);
  }

  function listTaskRuns(taskId, limit = 50) {
    const normalizedLimit = Number.isFinite(Number(limit))
      ? Math.max(1, Math.min(500, Math.floor(Number(limit))))
      : 50;
    return queries.listTaskRunsByTask
      .all(taskId, normalizedLimit)
      .map(toTaskRun);
  }

  function listTaskRunLogs(runId, limit = 200) {
    const normalizedLimit = Number.isFinite(Number(limit))
      ? Math.max(1, Math.min(2_000, Math.floor(Number(limit))))
      : 200;
    return queries.listTaskRunLogsByRun
      .all(runId, normalizedLimit)
      .map(toTaskRunLog);
  }

  function requestCancelTaskRun(runId, reason) {
    const existing = queries.getTaskRunById.get(runId);
    if (!existing) {
      return {
        accepted: false,
        run: null,
        requiresSignal: false,
        reason: "not_found",
      };
    }

    if (
      existing.status === "succeeded" ||
      existing.status === "failed" ||
      existing.status === "canceled" ||
      existing.status === "timeout"
    ) {
      return {
        accepted: false,
        run: toTaskRun(existing),
        requiresSignal: false,
        reason: "already_finished",
      };
    }

    const message = normalizeNonEmptyText(reason, "Run canceled by operator.");
    const timestamp = now();

    if (existing.status === "queued") {
      cancelRunImmediately(runId, message, timestamp);
      const canceled = queries.getTaskRunById.get(runId);
      return {
        accepted: true,
        run: canceled ? toTaskRun(canceled) : null,
        requiresSignal: false,
        reason: "queued_canceled",
      };
    }

    const requestCancel = db.transaction(() => {
      const updated = queries.updateTaskRunCancelRequested.run(
        timestamp,
        runId,
      );
      if (updated.changes === 0) {
        return false;
      }
      queries.insertTaskRunLog.run({
        runId,
        ts: timestamp,
        level: "warn",
        phase: "cancel",
        message: "Cancellation requested. Waiting for worker interruption.",
        metaJson: JSON.stringify({ reason: message }),
      });
      return true;
    });

    const accepted = requestCancel();
    const requested = queries.getTaskRunById.get(runId);
    return {
      accepted,
      run: requested ? toTaskRun(requested) : null,
      requiresSignal: accepted,
      reason: accepted ? "running_cancel_requested" : "not_running",
    };
  }

  function updateTaskLifecycleStatus(taskId, lifecycleStatus, options = {}) {
    const nextStatus = normalizeLifecycleStatus(lifecycleStatus);
    const existing = queries.getTaskDefinitionById.get(taskId);
    if (!existing) {
      return {
        task: null,
        signaledRunIds: [],
      };
    }

    const normalizedOptions =
      options && typeof options === "object" ? options : {};
    const cancelActiveRuns =
      normalizedOptions.cancelActiveRuns === undefined
        ? nextStatus === "paused" || nextStatus === "terminated"
        : Boolean(normalizedOptions.cancelActiveRuns);
    const timestamp = now();
    const signaledRunIds = [];

    const updateLifecycle = db.transaction(() => {
      queries.updateTaskDefinitionLifecycleStatus.run(
        nextStatus,
        timestamp,
        taskId,
      );
      if (nextStatus === "terminated") {
        queries.updateTaskScheduleNextRunAt.run(null, taskId);
      }

      if (!cancelActiveRuns) {
        return;
      }

      const cancelableRuns = queries.listCancelableTaskRunsByTask.all(taskId);
      for (const run of cancelableRuns) {
        if (run.status === "queued") {
          cancelRunImmediately(
            run.id,
            `Run canceled because task moved to "${nextStatus}".`,
            timestamp,
          );
          continue;
        }

        if (run.status === "running") {
          const updated = queries.updateTaskRunCancelRequested.run(
            timestamp,
            run.id,
          );
          if (updated.changes > 0) {
            queries.insertTaskRunLog.run({
              runId: run.id,
              ts: timestamp,
              level: "warn",
              phase: "cancel",
              message: `Cancellation requested because task moved to "${nextStatus}".`,
              metaJson: JSON.stringify({ taskStatus: nextStatus }),
            });
            signaledRunIds.push(run.id);
          }
        }
      }
    });

    updateLifecycle();
    const task = queries.getTaskDefinitionById.get(taskId);
    return {
      task: task ? toTaskDefinition(task) : null,
      signaledRunIds,
    };
  }

  function enqueueDueScheduledRuns(limit = 20) {
    const timestamp = now();
    const normalizedLimit = Number.isFinite(Number(limit))
      ? Math.max(1, Math.min(500, Math.floor(Number(limit))))
      : 20;
    const dueRows = queries.listDueTaskSchedules.all(
      timestamp,
      normalizedLimit,
    );
    const createdRuns = [];

    const enqueueDue = db.transaction(() => {
      for (const row of dueRows) {
        const run = enqueueTaskRun(row.task_id, {
          triggerType: "schedule",
          priority: 100,
        });
        if (run) {
          createdRuns.push(run);
        }

        if (row.schedule_type === "once") {
          queries.updateTaskScheduleNextAndLastRunAt.run(
            null,
            timestamp,
            row.task_id,
          );
          continue;
        }

        if (row.schedule_type === "cron") {
          const nextRunAt = computeNextCronRunAt(row.cron_expr, timestamp);
          queries.updateTaskScheduleNextAndLastRunAt.run(
            nextRunAt,
            timestamp,
            row.task_id,
          );
          if (!nextRunAt && run) {
            queries.insertTaskRunLog.run({
              runId: run.id,
              ts: timestamp,
              level: "warn",
              phase: "schedule",
              message:
                "Cron expression is unsupported by local parser. Future auto-trigger is disabled until nextRunAt is updated.",
              metaJson: JSON.stringify({
                cronExpr: row.cron_expr ?? null,
              }),
            });
          }
        }
      }
    });

    enqueueDue();
    return createdRuns;
  }

  function leaseNextQueuedRun(leaseOwner, leaseMs = 15_000) {
    const owner = normalizeNonEmptyText(leaseOwner, "local-worker");
    const leaseDuration = Number.isFinite(Number(leaseMs))
      ? Math.max(1_000, Math.floor(Number(leaseMs)))
      : 15_000;
    const timestamp = now();
    const leaseExpiresAt = timestamp + leaseDuration;

    const lease = db.transaction(() => {
      const candidate = queries.getTaskQueueCandidate.get(timestamp, timestamp);
      if (!candidate) {
        return null;
      }

      const updated = queries.leaseTaskQueueById.run(
        owner,
        leaseExpiresAt,
        timestamp,
        candidate.id,
        timestamp,
        timestamp,
      );

      if (updated.changes === 0) {
        return null;
      }

      return {
        queueId: candidate.id,
        runId: candidate.run_id,
        leaseOwner: owner,
        leaseExpiresAt,
      };
    });

    return lease();
  }

  function releaseQueuedRunLease(runId) {
    const result = queries.releaseTaskQueueLeaseByRunId.run(now(), runId);
    return result.changes > 0;
  }

  function completeQueuedRun(runId) {
    const result = queries.completeTaskQueueByRunId.run(now(), runId);
    return result.changes > 0;
  }

  function getTaskRunExecutionPayload(runId) {
    const row = queries.getTaskExecutionPayloadByRunId.get(runId);
    if (!row) {
      return null;
    }

    return {
      runId: row.run_id,
      taskId: row.task_id,
      triggerType: row.trigger_type,
      queuedAt: row.queued_at,
      task: {
        id: row.task_id,
        title: row.task_title,
        description: row.task_description,
        type: row.task_type,
        payload: parseJsonSafe(row.payload_json || "{}", {}),
      },
    };
  }

  function markTaskRunStarted(runId, workerId) {
    const timestamp = now();
    const result = queries.updateTaskRunStarted.run(
      timestamp,
      timestamp,
      normalizeOptionalText(workerId),
      runId,
    );
    if (result.changes > 0) {
      queries.insertTaskRunLog.run({
        runId,
        ts: timestamp,
        level: "info",
        phase: "dispatch",
        message: "Run has been dispatched to local worker.",
        metaJson: JSON.stringify({ workerId: workerId ?? null }),
      });
      return true;
    }
    return false;
  }

  function appendTaskRunLog(runId, level, phase, message, meta) {
    const timestamp = now();
    queries.insertTaskRunLog.run({
      runId,
      ts: timestamp,
      level: normalizeNonEmptyText(level, "info"),
      phase: normalizeNonEmptyText(phase, "execute"),
      message: normalizeNonEmptyText(message, ""),
      metaJson: normalizeJson(meta ?? {}, {}),
    });
    return true;
  }

  function updateTaskRunProgress(runId, progress) {
    const normalizedProgress = Number.isFinite(Number(progress))
      ? Math.max(0, Math.min(100, Math.floor(Number(progress))))
      : 0;
    const result = queries.updateTaskRunProgress.run(
      normalizedProgress,
      now(),
      runId,
    );
    return result.changes > 0;
  }

  function markTaskRunSucceeded(runId, resultPayload = {}) {
    const timestamp = now();
    const markSucceeded = db.transaction(() => {
      const updated = queries.updateTaskRunSucceeded.run(
        timestamp,
        timestamp,
        normalizeJson(resultPayload, {}),
        runId,
      );
      if (updated.changes === 0) {
        return false;
      }
      queries.completeTaskQueueByRunId.run(timestamp, runId);
      queries.insertTaskRunLog.run({
        runId,
        ts: timestamp,
        level: "info",
        phase: "finalize",
        message: "Run completed successfully.",
        metaJson: normalizeJson(resultPayload, {}),
      });
      return true;
    });

    return markSucceeded();
  }

  function markTaskRunFailed(runId, errorCode, errorMessage) {
    const timestamp = now();
    const code = normalizeOptionalText(errorCode) ?? "RUN_FAILED";
    const message = normalizeNonEmptyText(
      errorMessage,
      "Run execution failed.",
    );
    const markFailed = db.transaction(() => {
      const updated = queries.updateTaskRunFailed.run(
        timestamp,
        timestamp,
        code,
        message,
        runId,
      );
      if (updated.changes === 0) {
        return false;
      }
      queries.completeTaskQueueByRunId.run(timestamp, runId);
      queries.insertTaskRunLog.run({
        runId,
        ts: timestamp,
        level: "error",
        phase: "finalize",
        message,
        metaJson: JSON.stringify({ code }),
      });
      return true;
    });

    return markFailed();
  }

  function markTaskRunCanceled(runId, reason) {
    return cancelRunImmediately(runId, reason);
  }

  function getSettings() {
    const row = queries.getSettings.get("user-settings");
    return toSettings(row);
  }

  function saveSettings(settings) {
    const normalized = {
      ...defaultSettings,
      ...settings,
      modelName: String(settings.modelName || defaultSettings.modelName),
      themeMode: settings.themeMode === "dark" ? "dark" : "light",
      baseUrl: String(settings.baseUrl || ""),
      apiKey: String(settings.apiKey || ""),
      langsmithEnabled: Boolean(settings.langsmithEnabled),
      langsmithApiKey: String(settings.langsmithApiKey || ""),
      langsmithProject: String(settings.langsmithProject || ""),
      langsmithEndpoint: String(settings.langsmithEndpoint || ""),
    };

    queries.upsertSettings.run({
      ...normalized,
      langsmithEnabled: Number(normalized.langsmithEnabled),
      langsmithApiKey: normalized.langsmithApiKey,
      langsmithProject: normalized.langsmithProject,
      langsmithEndpoint: normalized.langsmithEndpoint,
      desktopNotifications: Number(normalized.desktopNotifications),
      developerLogging: Number(normalized.developerLogging),
      dataTelemetry: Number(normalized.dataTelemetry),
    });
    return true;
  }

  function close() {
    if (closed) {
      return false;
    }

    db.close();
    closed = true;
    return true;
  }

  return {
    bootstrapData,
    listChats,
    createChat,
    renameChat,
    deleteChat,
    getChatMessages,
    getChatMemory,
    saveChatMemory,
    appendMessage,
    listTasks,
    upsertTask,
    createTaskDefinition,
    listTaskDefinitions,
    runTaskNow,
    listTaskRuns,
    listTaskRunLogs,
    updateTaskLifecycleStatus,
    requestCancelTaskRun,
    enqueueDueScheduledRuns,
    leaseNextQueuedRun,
    releaseQueuedRunLease,
    completeQueuedRun,
    getTaskRunExecutionPayload,
    markTaskRunStarted,
    appendTaskRunLog,
    updateTaskRunProgress,
    markTaskRunSucceeded,
    markTaskRunFailed,
    markTaskRunCanceled,
    getSettings,
    saveSettings,
    close,
    getDbPath: () => dbPath,
    createAgentRun: (payload) => {
      const nowTs = now();
      const row = {
        id: payload.id,
        taskRunId: payload.taskRunId,
        traceId: payload.traceId || null,
        status: payload.status || "running",
        summary: payload.summary || null,
        startedAt: payload.startedAt || nowTs,
        endedAt: payload.endedAt || null,
        createdAt: payload.createdAt || nowTs,
        updatedAt: payload.updatedAt || nowTs,
      };
      queries.insertAgentRun.run(row);
      return row;
    },
    updateAgentRunStatus: (id, status, summary, endedAt) => {
      const nowTs = now();
      queries.updateAgentRunStatus.run(
        status,
        summary || null,
        endedAt || nowTs,
        nowTs,
        id,
      );
      return true;
    },
    appendAgentStep: (payload) => {
      const row = {
        agentRunId: payload.agentRunId,
        agentName: payload.agentName || "agent",
        stepIndex: Number.isFinite(Number(payload.stepIndex))
          ? Number(payload.stepIndex)
          : 0,
        inputText: payload.inputText || null,
        outputText: payload.outputText || null,
        status: payload.status || "completed",
        ts: payload.ts || now(),
        metaJson: JSON.stringify(payload.meta || {}),
      };
      queries.insertAgentStep.run(row);
      return row;
    },
    appendToolCall: (payload) => {
      const row = {
        agentRunId: payload.agentRunId,
        toolName: payload.toolName,
        inputJson: JSON.stringify(payload.input || {}),
        outputJson: JSON.stringify(payload.output || {}),
        status: payload.status || "success",
        elapsedMs: Number.isFinite(Number(payload.elapsedMs))
          ? Number(payload.elapsedMs)
          : null,
        ts: payload.ts || now(),
      };
      queries.insertToolCall.run(row);
      return row;
    },
    listAgentRunsByTaskRun: (taskRunId) =>
      queries.listAgentRunsByTaskRun.all(taskRunId),
    listAgentStepsByRun: (agentRunId) =>
      queries.listAgentStepsByRun.all(agentRunId),
    listToolCallsByRun: (agentRunId) =>
      queries.listToolCallsByRun.all(agentRunId),
  };
}

module.exports = {
  createStorage,
};
