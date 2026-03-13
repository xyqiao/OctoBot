/**
 * Precompiled database queries
 */

function createQueries(db) {
  return {
    // Chat queries
    countChats: db.prepare("SELECT COUNT(1) AS count FROM chats"),
    getChatById: db.prepare("SELECT * FROM chats WHERE id = ?"),
    listChats: db.prepare("SELECT * FROM chats ORDER BY updated_at DESC"),
    insertChat: db.prepare(
      "INSERT INTO chats (id, title, updated_at) VALUES (@id, @title, @updatedAt)",
    ),
    updateChatTime: db.prepare("UPDATE chats SET updated_at = ? WHERE id = ?"),
    updateChatTitle: db.prepare(
      "UPDATE chats SET title = ?, updated_at = ? WHERE id = ?",
    ),
    deleteChat: db.prepare("DELETE FROM chats WHERE id = ?"),

    // Message queries
    insertMessage: db.prepare(
      "INSERT INTO messages (id, chat_id, role, content, timestamp) VALUES (@id, @chatId, @role, @content, @timestamp)",
    ),
    listMessagesByChat: db.prepare(
      "SELECT * FROM messages WHERE chat_id = ? ORDER BY timestamp ASC",
    ),
    countUserMessagesByChat: db.prepare(
      "SELECT COUNT(1) AS count FROM messages WHERE chat_id = ? AND role = 'user'",
    ),

    // Chat memory queries
    getChatMemoryByChatId: db.prepare(
      "SELECT * FROM chat_memory WHERE chat_id = ?",
    ),
    upsertChatMemory: db.prepare(
      "INSERT INTO chat_memory (chat_id, summary_text, covered_until_timestamp, updated_at) VALUES (@chatId, @summaryText, @coveredUntilTimestamp, @updatedAt) ON CONFLICT(chat_id) DO UPDATE SET summary_text = excluded.summary_text, covered_until_timestamp = excluded.covered_until_timestamp, updated_at = excluded.updated_at",
    ),

    // Task UI queries
    countTasks: db.prepare("SELECT COUNT(1) AS count FROM tasks"),
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

    // Task definition queries
    insertTaskDefinition: db.prepare(
      `INSERT INTO task_definition (
         id, title, description, task_type, payload_json, lifecycle_status, created_at, updated_at
       ) VALUES (
         @id, @title, @description, @taskType, @payloadJson, @lifecycleStatus, @createdAt, @updatedAt
       )`,
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
    updateTaskDefinitionUpdatedAt: db.prepare(
      "UPDATE task_definition SET updated_at = ? WHERE id = ?",
    ),
    updateTaskDefinitionLifecycleStatus: db.prepare(
      "UPDATE task_definition SET lifecycle_status = ?, updated_at = ? WHERE id = ?",
    ),

    // Task schedule queries
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
    updateTaskScheduleLastRunAt: db.prepare(
      "UPDATE task_schedule SET last_run_at = ? WHERE task_id = ?",
    ),
    updateTaskScheduleNextRunAt: db.prepare(
      "UPDATE task_schedule SET next_run_at = ? WHERE task_id = ?",
    ),
    updateTaskScheduleNextAndLastRunAt: db.prepare(
      "UPDATE task_schedule SET next_run_at = ?, last_run_at = ? WHERE task_id = ?",
    ),

    // Task run queries
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
    listCancelableTaskRunsByTask: db.prepare(
      `SELECT id, status
       FROM task_run
       WHERE task_id = ?
         AND status IN ('queued', 'running')
       ORDER BY created_at DESC`,
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

    // Task run log queries
    insertTaskRunLog: db.prepare(
      `INSERT INTO task_run_log (run_id, ts, level, phase, message, meta_json)
       VALUES (@runId, @ts, @level, @phase, @message, @metaJson)`,
    ),
    listTaskRunLogsByRun: db.prepare(
      "SELECT * FROM task_run_log WHERE run_id = ? ORDER BY ts ASC LIMIT ?",
    ),

    // Task queue queries
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

    // Agent run queries
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
    listAgentRunsByTaskRun: db.prepare(
      `SELECT * FROM agent_run WHERE task_run_id = ? ORDER BY created_at DESC`,
    ),

    // Agent step queries
    insertAgentStep: db.prepare(
      `INSERT INTO agent_step (
         agent_run_id, agent_name, step_index, input_text, output_text, status, ts, meta_json
       ) VALUES (
         @agentRunId, @agentName, @stepIndex, @inputText, @outputText, @status, @ts, @metaJson
       )`,
    ),
    listAgentStepsByRun: db.prepare(
      `SELECT * FROM agent_step WHERE agent_run_id = ? ORDER BY ts ASC`,
    ),

    // Tool call queries
    insertToolCall: db.prepare(
      `INSERT INTO tool_call (
         agent_run_id, tool_name, input_json, output_json, status, elapsed_ms, ts
       ) VALUES (
         @agentRunId, @toolName, @inputJson, @outputJson, @status, @elapsedMs, @ts
       )`,
    ),
    listToolCallsByRun: db.prepare(
      `SELECT * FROM tool_call WHERE agent_run_id = ? ORDER BY ts ASC`,
    ),

    // Settings queries
    getSettings: db.prepare("SELECT * FROM settings WHERE id = ?"),
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
}

module.exports = {
  createQueries,
};
