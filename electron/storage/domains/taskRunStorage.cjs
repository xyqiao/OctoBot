/**
 * Task Run storage operations
 */

const { now, makeId, parseJsonSafe } = require("../utils/common.cjs");
const {
  normalizeNonEmptyText,
  normalizeOptionalText,
  normalizeTriggerType,
  normalizeRunStatus,
} = require("../utils/validators.cjs");
const { computeNextCronRunAt } = require("../utils/cronUtils.cjs");
const { toTaskRun, toTaskRunLog } = require("../utils/transformers.cjs");

function createTaskRunStorage(db, queries) {
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
        phase: "start",
        message: "Run started by worker.",
        metaJson: JSON.stringify({ workerId: normalizeOptionalText(workerId) }),
      });
    }
    return result.changes > 0;
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

  function markTaskRunSucceeded(runId, result = {}) {
    const timestamp = now();
    const resultJson = JSON.stringify(result);
    const updated = queries.updateTaskRunSucceeded.run(
      timestamp,
      timestamp,
      resultJson,
      runId,
    );
    if (updated.changes > 0) {
      queries.insertTaskRunLog.run({
        runId,
        ts: timestamp,
        level: "info",
        phase: "complete",
        message: "Run completed successfully.",
        metaJson: JSON.stringify({}),
      });
    }
    return updated.changes > 0;
  }

  function markTaskRunFailed(runId, errorCode, errorMessage) {
    const timestamp = now();
    const code = normalizeNonEmptyText(errorCode, "UNKNOWN_ERROR");
    const message = normalizeNonEmptyText(errorMessage, "An error occurred.");
    const updated = queries.updateTaskRunFailed.run(
      timestamp,
      timestamp,
      code,
      message,
      runId,
    );
    if (updated.changes > 0) {
      queries.insertTaskRunLog.run({
        runId,
        ts: timestamp,
        level: "error",
        phase: "error",
        message,
        metaJson: JSON.stringify({ code }),
      });
    }
    return updated.changes > 0;
  }

  function appendTaskRunLog(runId, level, phase, message, meta = {}) {
    queries.insertTaskRunLog.run({
      runId,
      ts: now(),
      level: normalizeNonEmptyText(level, "info"),
      phase: normalizeNonEmptyText(phase, "exec"),
      message: normalizeNonEmptyText(message, ""),
      metaJson: JSON.stringify(meta),
    });
    return true;
  }

  return {
    enqueueTaskRun,
    runTaskNow,
    listTaskRuns,
    listTaskRunLogs,
    requestCancelTaskRun,
    enqueueDueScheduledRuns,
    leaseNextQueuedRun,
    releaseQueuedRunLease,
    completeQueuedRun,
    getTaskRunExecutionPayload,
    markTaskRunStarted,
    updateTaskRunProgress,
    markTaskRunSucceeded,
    markTaskRunFailed,
    appendTaskRunLog,
  };
}

module.exports = {
  createTaskRunStorage,
};
