/**
 * Data transformation functions for storage layer
 */

const { parseJsonSafe } = require("./common.cjs");

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

function toAgentRun(row) {
  return {
    id: row.id,
    taskRunId: row.task_run_id,
    agentType: row.agent_type,
    status: row.status,
    startedAt: row.started_at,
    endedAt: row.ended_at ?? undefined,
    inputSnapshot: parseJsonSafe(row.input_snapshot_json || "{}", {}),
    outputSnapshot: parseJsonSafe(row.output_snapshot_json || "{}", {}),
    errorMessage: row.error_message ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toAgentRunStep(row) {
  return {
    id: row.id,
    agentRunId: row.agent_run_id,
    stepIndex: row.step_index,
    stepType: row.step_type,
    status: row.status,
    startedAt: row.started_at,
    endedAt: row.ended_at ?? undefined,
    inputData: parseJsonSafe(row.input_data_json || "{}", {}),
    outputData: parseJsonSafe(row.output_data_json || "{}", {}),
    errorMessage: row.error_message ?? undefined,
    createdAt: row.created_at,
  };
}

function toAgentRunToolCall(row) {
  return {
    id: row.id,
    agentRunId: row.agent_run_id,
    stepId: row.step_id ?? undefined,
    toolName: row.tool_name,
    toolInput: parseJsonSafe(row.tool_input_json || "{}", {}),
    toolOutput: parseJsonSafe(row.tool_output_json || "{}", {}),
    status: row.status,
    startedAt: row.started_at,
    endedAt: row.ended_at ?? undefined,
    errorMessage: row.error_message ?? undefined,
    createdAt: row.created_at,
  };
}

function toSettings(row) {
  const { defaultSettings } = require("../schema.cjs");

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

module.exports = {
  toChat,
  toMessage,
  toChatMemory,
  toTask,
  toTaskDefinition,
  toTaskRun,
  toTaskRunLog,
  toAgentRun,
  toAgentRunStep,
  toAgentRunToolCall,
  toSettings,
};
