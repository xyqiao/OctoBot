/**
 * IPC handlers for agent run and database operations
 */

const { ipcMain, Notification } = require("electron");

function registerMiscHandlers({ storage }) {
  ipcMain.handle("desktop:notify", (_event, title, body) => {
    if (!Notification.isSupported()) {
      return false;
    }

    const notification = new Notification({ title, body });
    notification.show();
    return true;
  });

  ipcMain.handle("db:bootstrap", () => storage.bootstrapData());

  ipcMain.handle("agent:run:listByTaskRun", (_event, taskRunId) =>
    storage.listAgentRunsByTaskRun(taskRunId),
  );

  ipcMain.handle("agent:run:steps", (_event, agentRunId) =>
    storage.listAgentStepsByRun(agentRunId),
  );

  ipcMain.handle("agent:run:toolCalls", (_event, agentRunId) =>
    storage.listToolCallsByRun(agentRunId),
  );

  ipcMain.handle("db:getSettings", () => storage.getSettings());
  ipcMain.handle("db:saveSettings", (_event, settings) =>
    storage.saveSettings(settings),
  );
}

module.exports = { registerMiscHandlers };
