const { contextBridge, ipcRenderer } = require("electron");

function makeStreamId(prefix = "chat_stream") {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
}

contextBridge.exposeInMainWorld("desktopApi", {
  notify: (title, body) => ipcRenderer.invoke("desktop:notify", title, body),
  runAgentChat: (payload) => ipcRenderer.invoke("agent:chat", payload),
  runAgentChatStream: async (payload, onEvent) => {
    const streamId = makeStreamId();
    const channel = `agent:chat:stream:${streamId}`;

    const listener = (_event, data) => {
      onEvent?.(data);
      if (data?.type === "done" || data?.type === "error") {
        ipcRenderer.removeListener(channel, listener);
      }
    };

    ipcRenderer.on(channel, listener);

    try {
      await ipcRenderer.invoke("agent:chat:stream/start", { streamId, payload });
    } catch (error) {
      ipcRenderer.removeListener(channel, listener);
      onEvent?.({
        type: "error",
        error: error instanceof Error ? error.message : String(error),
      });
    }

    return streamId;
  },
  cancelAgentChatStream: (streamId) => ipcRenderer.invoke("agent:chat:stream/cancel", streamId),
  runTaskWorkflow: (payload) => ipcRenderer.invoke("agent:task", payload),
  createTaskDefinition: (payload) => ipcRenderer.invoke("task:create", payload),
  listTaskDefinitions: () => ipcRenderer.invoke("task:list"),
  updateTaskStatus: (taskId, lifecycleStatus, options) =>
    ipcRenderer.invoke("task:updateStatus", taskId, lifecycleStatus, options),
  runTaskNow: (taskId, options) => ipcRenderer.invoke("task:runNow", taskId, options),
  listTaskRuns: (taskId, limit) => ipcRenderer.invoke("task:runs:list", taskId, limit),
  cancelTaskRun: (runId, reason) => ipcRenderer.invoke("task:run:cancel", runId, reason),
  listTaskRunLogs: (runId, limit) => ipcRenderer.invoke("task:run:logs", runId, limit),
  bootstrapData: () => ipcRenderer.invoke("db:bootstrap"),
  listChats: () => ipcRenderer.invoke("db:listChats"),
  createChat: () => ipcRenderer.invoke("db:createChat"),
  renameChat: (chatId, title) => ipcRenderer.invoke("db:renameChat", chatId, title),
  deleteChat: (chatId) => ipcRenderer.invoke("db:deleteChat", chatId),
  getChatMessages: (chatId) => ipcRenderer.invoke("db:getChatMessages", chatId),
  appendMessage: (message) => ipcRenderer.invoke("db:appendMessage", message),
  listTasks: () => ipcRenderer.invoke("db:listTasks"),
  upsertTask: (task) => ipcRenderer.invoke("db:upsertTask", task),
  getSettings: () => ipcRenderer.invoke("db:getSettings"),
  saveSettings: (settings) => ipcRenderer.invoke("db:saveSettings", settings),
});
