const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("desktopApi", {
  notify: (title, body) => ipcRenderer.invoke("desktop:notify", title, body),
  runAgentChat: (payload) => ipcRenderer.invoke("agent:chat", payload),
  runTaskWorkflow: (payload) => ipcRenderer.invoke("agent:task", payload),
  bootstrapData: () => ipcRenderer.invoke("db:bootstrap"),
  listChats: () => ipcRenderer.invoke("db:listChats"),
  getChatMessages: (chatId) => ipcRenderer.invoke("db:getChatMessages", chatId),
  appendMessage: (message) => ipcRenderer.invoke("db:appendMessage", message),
  listTasks: () => ipcRenderer.invoke("db:listTasks"),
  upsertTask: (task) => ipcRenderer.invoke("db:upsertTask", task),
  getSettings: () => ipcRenderer.invoke("db:getSettings"),
  saveSettings: (settings) => ipcRenderer.invoke("db:saveSettings", settings),
});
