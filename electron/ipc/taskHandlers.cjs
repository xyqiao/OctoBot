/**
 * IPC handlers for task-related operations
 */

const { ipcMain } = require("electron");

function registerTaskHandlers({ storage, getRuntime, withEnabledSkills, taskDispatcher }) {
  ipcMain.handle("agent:task", async (_event, payload) => {
    const runtime = await getRuntime();
    return runtime.runTaskWorkflow(await withEnabledSkills(payload));
  });

  ipcMain.handle("task:list", () => storage.listTaskDefinitions());

  ipcMain.handle("task:updateStatus", (_event, taskId, lifecycleStatus, options) => {
    const result = storage.updateTaskLifecycleStatus(
      taskId,
      lifecycleStatus,
      options,
    );

    if (result?.signaledRunIds?.length > 0) {
      for (const runId of result.signaledRunIds) {
        const canceled = taskDispatcher?.cancelRun(
          runId,
          `Task moved to "${lifecycleStatus}".`,
        );
        if (!canceled) {
          storage.appendTaskRunLog(
            runId,
            "warn",
            "cancel",
            "Cancellation requested but no active worker accepted the signal. It will be retried on dispatch.",
            {},
          );
        }
      }
    }

    return result?.task ?? null;
  });

  ipcMain.handle("task:runNow", (_event, taskId, options) =>
    storage.runTaskNow(taskId, options),
  );

  ipcMain.handle("task:runs:list", (_event, taskId, limit) =>
    storage.listTaskRuns(taskId, limit),
  );

  ipcMain.handle("task:run:cancel", (_event, runId, reason) => {
    const result = storage.requestCancelTaskRun(runId, reason);
    if (result?.accepted && result?.requiresSignal) {
      const canceled = taskDispatcher?.cancelRun(runId, reason);
      if (!canceled) {
        storage.appendTaskRunLog(
          runId,
          "warn",
          "cancel",
          "Cancellation requested but no active worker accepted the signal. It will be retried on dispatch.",
          {},
        );
      }
    }
    return result;
  });

  ipcMain.handle("task:run:logs", (_event, runId, limit) =>
    storage.listTaskRunLogs(runId, limit),
  );

  ipcMain.handle("db:listTasks", () => storage.listTasks());
  ipcMain.handle("db:upsertTask", (_event, task) => storage.upsertTask(task));
}

module.exports = { registerTaskHandlers };
