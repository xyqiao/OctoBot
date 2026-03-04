function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function send(message) {
  if (process.send) {
    process.send(message);
  }
}

let busyRunId = null;
let shuttingDown = false;
const canceledRunIds = new Set();
const cancelReasons = new Map();

async function executeRun(payload) {
  const runId = payload.runId;
  const task = payload.execution?.task ?? {};

  try {
    send({
      type: "log",
      runId,
      level: "info",
      phase: "prepare",
      message: `Local worker started task "${task.title || runId}".`,
      meta: {
        taskType: task.type || "custom",
      },
    });

    const steps = [
      { progress: 15, phase: "prepare", message: "Preparing runtime context." },
      { progress: 40, phase: "plan", message: "Generating execution plan." },
      { progress: 70, phase: "execute", message: "Executing plugin pipeline." },
      { progress: 90, phase: "finalize", message: "Finalizing output artifacts." },
      { progress: 100, phase: "finalize", message: "Execution completed." },
    ];

    for (const step of steps) {
      if (shuttingDown || busyRunId !== runId || canceledRunIds.has(runId)) {
        throw new Error("RUN_ABORTED");
      }
      await sleep(350);
      if (shuttingDown || busyRunId !== runId || canceledRunIds.has(runId)) {
        throw new Error("RUN_ABORTED");
      }
      send({
        type: "progress",
        runId,
        progress: step.progress,
      });
      send({
        type: "log",
        runId,
        level: "info",
        phase: step.phase,
        message: step.message,
      });
    }

    send({
      type: "completed",
      runId,
      result: {
        summary: "Local stub worker completed execution.",
        completedAt: Date.now(),
      },
    });
  } catch (error) {
    const code =
      error instanceof Error && error.message === "RUN_ABORTED"
        ? "RUN_CANCELED"
        : "WORKER_EXECUTION_FAILED";
    const cancelReason = cancelReasons.get(runId);
    send({
      type: "failed",
      runId,
      errorCode: code,
      errorMessage:
        code === "RUN_CANCELED"
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
    send({
      type: "log",
      runId,
      level: "warn",
      phase: "cancel",
      message: "Cancellation acknowledged by worker.",
    });
  }
});
