const { runCapabilityCall } = require("../agentTools/capabilities/capabilityRunner.cjs");
const path = require("path");
const { pathToFileURL } = require("url");

function send(message) {
  if (process.send) {
    process.send(message);
  }
}

function toSafeString(value, fallback = "") {
  if (typeof value === "string") {
    return value;
  }
  if (value === undefined || value === null) {
    return fallback;
  }
  return String(value);
}

function normalizeObject(value) {
  return value && typeof value === "object" ? value : {};
}

function normalizeArray(value) {
  return Array.isArray(value) ? value : [];
}

function createAbortError() {
  const error = new Error("RUN_ABORTED");
  error.code = "RUN_ABORTED";
  return error;
}

let busyRunId = null;

async function getAgentRuntime() {
  const runtimeUrl = pathToFileURL(path.join(__dirname, "..", "agentRuntime.mjs")).href;
  return import(runtimeUrl);
}
let shuttingDown = false;
const canceledRunIds = new Set();
const cancelReasons = new Map();

function isRunCanceled(runId) {
  return shuttingDown || busyRunId !== runId || canceledRunIds.has(runId);
}

function assertRunActive(runId) {
  if (isRunCanceled(runId)) {
    throw createAbortError();
  }
}

function normalizeCapabilityName(action) {
  return toSafeString(action, "").trim().toLowerCase();
}

function normalizeCapabilityCall(rawCall) {
  const source = normalizeObject(rawCall);
  const name = normalizeCapabilityName(
    source.name || source.capability || source.tool || source.action,
  );
  const nestedArgs = normalizeObject(source.args || source.input || source.params);
  const args =
    Object.keys(nestedArgs).length > 0
      ? nestedArgs
      : (() => {
          const {
            name: _name,
            capability: _capability,
            tool: _tool,
            action: _action,
            args: _args,
            input: _input,
            params: _params,
            ...rest
          } = source;
          return normalizeObject(rest);
        })();
  return {
    name,
    args,
  };
}

function buildTaskFallbackCall(taskType, payload) {
  const normalizedType = toSafeString(taskType, "custom");
  const source = normalizeObject(payload);

  if (normalizedType === "file_ops") {
    if (source.path && source.content !== undefined) {
      return {
        name: "write_file",
        args: source,
      };
    }
    if (source.path && source.action === "list_directory") {
      return {
        name: "list_directory",
        args: source,
      };
    }
    if (source.path) {
      return {
        name: "read_text_file",
        args: source,
      };
    }
  }

  if (normalizedType === "office_doc") {
    if (source.path && (source.rows || source.paragraphs || source.content !== undefined)) {
      return {
        name: "office_write_document",
        args: source,
      };
    }
    if (source.path) {
      return {
        name: "office_read_document",
        args: source,
      };
    }
  }

  return null;
}

function normalizeTaskToolCalls(task = {}) {
  const taskPayload = normalizeObject(task.payload);
  const directCall = normalizeCapabilityCall(taskPayload);
  const toolCalls = normalizeArray(taskPayload.toolCalls).map(normalizeCapabilityCall);
  const operations = normalizeArray(taskPayload.operations).map(normalizeCapabilityCall);
  const merged = [...toolCalls, ...operations];

  if (directCall.name) {
    merged.push(directCall);
  }

  const fallbackCall = buildTaskFallbackCall(task.type, taskPayload);
  if (merged.length === 0 && fallbackCall) {
    merged.push(fallbackCall);
  }

  return merged.filter((call) => call.name);
}

function summarizeResult(result) {
  if (result === null || result === undefined) {
    return "null";
  }
  const text = JSON.stringify(result);
  if (!text) {
    return "empty";
  }
  if (text.length <= 280) {
    return text;
  }
  return `${text.slice(0, 280)}...(truncated)`;
}

function sendProgress(runId, progress) {
  send({
    type: "progress",
    runId,
    progress: Math.max(0, Math.min(100, Math.floor(progress))),
  });
}

function sendLog(runId, level, phase, message, meta = {}) {
  send({
    type: "log",
    runId,
    level,
    phase,
    message,
    meta,
  });
}


async function executeAgentTask(runId, task, context) {
  const payload = normalizeObject(task.payload);
  const runtime = await getAgentRuntime();
  const result = await runtime.runMultiAgentChat({
    prompt: toSafeString(payload.prompt || task.description || ""),
    apiKey: toSafeString(payload.apiKey || ""),
    modelName: toSafeString(payload.modelName || ""),
    baseUrl: toSafeString(payload.baseUrl || ""),
    enabledSkillSpecs: normalizeArray(payload.enabledSkillSpecs),
    onLog: (message) => sendLog(runId, "info", "agent", message),
  });
  return result;
}

async function executeRun(payload) {
  const runId = payload.runId;
  const task = normalizeObject(payload.execution?.task);
  const taskPayload = normalizeObject(task.payload);
  const taskCalls = normalizeTaskToolCalls(task);
  const taskAllowedRoots = normalizeArray(taskPayload.allowedRoots).filter(
    (item) => typeof item === "string" && item.trim(),
  );
  const taskAuditLogPath = toSafeString(taskPayload.auditLogPath, "").trim();

  try {
    sendLog(
      runId,
      "info",
      "prepare",
      `Local worker started task "${task.title || runId}".`,
      { taskType: task.type || "custom", callCount: taskCalls.length },
    );
    sendProgress(runId, 5);

    if (task.type === "agent_task") {
      sendLog(runId, "info", "execute", "Executing agent task via LangGraph.");
      const result = await executeAgentTask(runId, task, { runId });
      sendProgress(runId, 95);
      sendLog(runId, "info", "finalize", "Agent task finalized successfully.");
      sendProgress(runId, 100);
      send({
        type: "completed",
        runId,
        result: {
          summary: "Executed agent task.",
          agentResult: result,
          completedAt: Date.now(),
        },
      });
      return;
    }

    if (taskCalls.length === 0) {
      throw new Error(
        "Task payload has no executable tool call. Use payload.toolCalls or payload.operations.",
      );
    }

    const results = [];
    for (let index = 0; index < taskCalls.length; index += 1) {
      assertRunActive(runId);
      const call = taskCalls[index];
      const displayIndex = index + 1;
      const progressStart = 10 + Math.floor((70 * index) / taskCalls.length);

      sendProgress(runId, progressStart);
      sendLog(
        runId,
        "info",
        "execute",
        `Executing tool call ${displayIndex}/${taskCalls.length}: ${call.name}`,
        {
          toolName: call.name,
          args: call.args,
        },
      );

      const result = await runCapabilityCall(call.name, call.args, {
        baseDir: process.cwd(),
        isAborted: () => isRunCanceled(runId),
        onLog: (message, meta) => {
          sendLog(runId, "info", "tool", message, meta);
        },
        allowedRoots: taskAllowedRoots,
        auditLogPath: taskAuditLogPath || undefined,
        runContext: {
          source: "task_worker",
          runId,
          taskId: task.id || "",
          taskType: task.type || "custom",
          toolName: call.name,
        },
      });

      assertRunActive(runId);
      results.push({
        name: call.name,
        args: call.args,
        result,
      });

      const progressEnd = 10 + Math.floor((70 * (index + 1)) / taskCalls.length);
      sendProgress(runId, progressEnd);
      sendLog(
        runId,
        "info",
        "execute",
        `Tool call ${displayIndex}/${taskCalls.length} completed: ${call.name}`,
        {
          toolName: call.name,
          resultPreview: summarizeResult(result),
        },
      );
    }

    assertRunActive(runId);
    sendProgress(runId, 95);
    sendLog(runId, "info", "finalize", "Task finalized successfully.");
    sendProgress(runId, 100);

    send({
      type: "completed",
      runId,
      result: {
        summary: `Executed ${results.length} capability call(s).`,
        toolResults: results,
        completedAt: Date.now(),
      },
    });
  } catch (error) {
    const isAbort =
      error?.code === "RUN_ABORTED" ||
      (error instanceof Error && error.message === "RUN_ABORTED");
    const code = isAbort ? "RUN_CANCELED" : "WORKER_EXECUTION_FAILED";
    const cancelReason = cancelReasons.get(runId);
    send({
      type: "failed",
      runId,
      errorCode: code,
      errorMessage: isAbort
        ? cancelReason || "Run canceled by operator."
        : error instanceof Error
          ? error.message
          : String(error),
    });
  } finally {
    canceledRunIds.delete(runId);
    cancelReasons.delete(runId);
    if (busyRunId === runId) {
      busyRunId = null;
    }
  }
}

process.on("message", (message) => {
  if (!message || typeof message !== "object") {
    return;
  }

  if (message.type === "shutdown") {
    shuttingDown = true;
    process.exit(0);
    return;
  }

  if (message.type === "run") {
    if (busyRunId) {
      send({
        type: "failed",
        runId: message.runId,
        errorCode: "WORKER_BUSY",
        errorMessage: "Worker is busy with another run.",
      });
      return;
    }
    busyRunId = message.runId;
    void executeRun(message);
    return;
  }

  if (message.type === "cancel") {
    const runId = message.runId;
    if (!runId || busyRunId !== runId) {
      return;
    }
    canceledRunIds.add(runId);
    cancelReasons.set(
      runId,
      typeof message.reason === "string" && message.reason.trim()
        ? message.reason.trim()
        : "Run canceled by operator.",
    );
    sendLog(runId, "warn", "cancel", "Cancellation acknowledged by worker.");
  }
});
