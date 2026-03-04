const { fork } = require("child_process");

class WorkerManager {
  constructor(options) {
    this.storage = options.storage;
    this.workerScriptPath = options.workerScriptPath;
    this.logger = options.logger || console;
    this.child = null;
    this.activeRunId = null;
    this.stopping = false;
    this.workerId = `local_worker_${process.pid}`;
  }

  start() {
    if (this.child) {
      return false;
    }

    this.stopping = false;
    const child = fork(this.workerScriptPath, [], {
      stdio: ["ignore", "ignore", "ignore", "ipc"],
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: "1",
      },
    });
    this.child = child;

    child.on("message", (message) => {
      this.handleMessage(message);
    });

    child.on("exit", (code, signal) => {
      if (this.child === child) {
        this.child = null;
      }
      const crashedRunId = this.activeRunId;
      this.activeRunId = null;

      if (crashedRunId) {
        this.storage.markTaskRunFailed(
          crashedRunId,
          "WORKER_EXITED",
          `Local worker exited unexpectedly (code=${code ?? "null"}, signal=${signal ?? "null"}).`,
        );
      }

      if (!this.stopping && !this.child) {
        this.logger.error(
          `[worker-manager] worker exited unexpectedly (code=${code ?? "null"}, signal=${signal ?? "null"}). Restarting...`,
        );
        this.start();
      }
    });

    return true;
  }

  stop() {
    if (!this.child) {
      return false;
    }

    this.stopping = true;
    const child = this.child;
    this.child = null;
    this.activeRunId = null;

    child.removeAllListeners("message");
    child.removeAllListeners("exit");

    try {
      child.send({ type: "shutdown" });
    } catch {
      // no-op
    }

    setTimeout(() => {
      child.kill("SIGTERM");
    }, 400);

    return true;
  }

  hasCapacity() {
    return Boolean(this.child) && !this.activeRunId;
  }

  cancelRun(runId, reason) {
    if (!this.child || this.activeRunId !== runId) {
      return false;
    }

    try {
      this.child.send({
        type: "cancel",
        runId,
        reason:
          typeof reason === "string" && reason.trim()
            ? reason.trim()
            : "Cancellation requested by operator.",
      });
      this.storage.appendTaskRunLog(
        runId,
        "warn",
        "cancel",
        "Cancellation signal sent to worker.",
        {},
      );
      return true;
    } catch (error) {
      this.storage.appendTaskRunLog(
        runId,
        "error",
        "cancel",
        "Failed to send cancellation signal to worker.",
        {
          error: error instanceof Error ? error.message : String(error),
        },
      );
      return false;
    }
  }

  dispatchRun(lease) {
    if (!this.child || !lease?.runId || this.activeRunId) {
      return false;
    }

    const execution = this.storage.getTaskRunExecutionPayload(lease.runId);
    if (!execution) {
      this.storage.markTaskRunFailed(
        lease.runId,
        "RUN_NOT_FOUND",
        "Task run payload was not found for dispatch.",
      );
      return true;
    }

    const marked = this.storage.markTaskRunStarted(
      lease.runId,
      this.workerId,
    );
    if (!marked) {
      return false;
    }

    try {
      this.activeRunId = lease.runId;
      this.child.send({
        type: "run",
        runId: lease.runId,
        execution,
      });
      return true;
    } catch (error) {
      this.activeRunId = null;
      this.storage.markTaskRunFailed(
        lease.runId,
        "DISPATCH_SEND_FAILED",
        error instanceof Error ? error.message : String(error),
      );
      return true;
    }
  }

  finishRun(runId) {
    if (this.activeRunId === runId) {
      this.activeRunId = null;
    }
  }

  handleMessage(message) {
    if (!message || typeof message !== "object") {
      return;
    }

    const runId = message.runId;
    if (!runId) {
      return;
    }

    if (message.type === "log") {
      this.storage.appendTaskRunLog(
        runId,
        message.level || "info",
        message.phase || "execute",
        message.message || "",
        message.meta || {},
      );
      return;
    }

    if (message.type === "progress") {
      this.storage.updateTaskRunProgress(runId, message.progress);
      return;
    }

    if (message.type === "completed") {
      this.storage.markTaskRunSucceeded(runId, message.result || {});
      this.finishRun(runId);
      return;
    }

    if (message.type === "failed") {
      if (message.errorCode === "RUN_CANCELED") {
        this.storage.markTaskRunCanceled(
          runId,
          message.errorMessage || "Run canceled by operator.",
        );
      } else {
        this.storage.markTaskRunFailed(
          runId,
          message.errorCode || "RUN_FAILED",
          message.errorMessage || "Worker reported failure.",
        );
      }
      this.finishRun(runId);
    }
  }
}

module.exports = {
  WorkerManager,
};
