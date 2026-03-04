const {
  app,
  BrowserWindow,
  ipcMain,
  Notification,
  shell,
} = require("electron");
const fs = require("fs");
const path = require("path");
const { pathToFileURL } = require("url");

const isDev = Boolean(process.env.VITE_DEV_SERVER_URL);
let storage = null;
let taskScheduler = null;
let taskDispatcher = null;
const activeChatStreams = new Map();
let shutdownHandled = false;

function isSafeExternalUrl(url) {
  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === "http:" ||
      parsed.protocol === "https:" ||
      parsed.protocol === "mailto:" ||
      parsed.protocol === "tel:"
    );
  } catch {
    return false;
  }
}

function watchDistAndReload(win) {
  const distDir = path.join(__dirname, "../dist");
  let reloadTimer = null;

  try {
    fs.watch(distDir, { recursive: true }, () => {
      if (reloadTimer) clearTimeout(reloadTimer);
      reloadTimer = setTimeout(() => {
        if (!win.isDestroyed()) {
          win.webContents.reloadIgnoringCache();
        }
      }, 120);
    });
  } catch (error) {
    console.warn("[dev-local] Failed to watch dist folder:", error);
  }
}

function runtimeModuleUrl() {
  return pathToFileURL(path.join(__dirname, "agentRuntime.mjs")).href;
}

async function getRuntime() {
  return import(runtimeModuleUrl());
}

function shutdownResources() {
  if (shutdownHandled) {
    return;
  }
  shutdownHandled = true;

  for (const controller of activeChatStreams.values()) {
    controller.abort();
  }
  activeChatStreams.clear();

  if (taskScheduler?.stop) {
    try {
      taskScheduler.stop();
    } catch (error) {
      console.error("[main] Failed to stop task scheduler:", error);
    }
  }

  if (taskDispatcher?.stop) {
    try {
      taskDispatcher.stop();
    } catch (error) {
      console.error("[main] Failed to stop task dispatcher:", error);
    }
  }

  if (storage?.close) {
    try {
      storage.close();
    } catch (error) {
      console.error("[main] Failed to close sqlite storage:", error);
    }
  }
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1660,
    height: 1020,
    minWidth: 1280,
    minHeight: 820,
    backgroundColor: "#eef2f8",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
    },
  });

  const appInternalUrl = isDev
    ? process.env.VITE_DEV_SERVER_URL ?? ""
    : pathToFileURL(path.join(__dirname, "../dist/index.html")).href;

  const isInternalUrl = (targetUrl) => {
    if (!targetUrl) {
      return false;
    }

    if (targetUrl === "about:blank" || targetUrl.startsWith("devtools://")) {
      return true;
    }

    if (isDev) {
      try {
        const appOrigin = new URL(appInternalUrl).origin;
        return new URL(targetUrl).origin === appOrigin;
      } catch {
        return false;
      }
    }

    return targetUrl.startsWith(appInternalUrl);
  };

  if (isDev) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    win.loadFile(path.join(__dirname, "../dist/index.html"));

    if (process.env.ELECTRON_WATCH === "1") {
      watchDistAndReload(win);
    }
  }

  win.webContents.on("will-navigate", (event, url) => {
    if (isInternalUrl(url)) {
      return;
    }

    event.preventDefault();
    if (isSafeExternalUrl(url)) {
      void shell.openExternal(url);
    }
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isSafeExternalUrl(url)) {
      void shell.openExternal(url);
    }
    return { action: "deny" };
  });
}

app
  .whenReady()
  .then(() => {
    try {
      const { createStorage } = require("./sqliteStorage.cjs");
      const { TaskScheduler } = require("./taskEngine/TaskScheduler.cjs");
      const { TaskDispatcher } = require("./taskEngine/TaskDispatcher.cjs");
      const { WorkerManager } = require("./taskEngine/WorkerManager.cjs");
      storage = createStorage(app.getPath("userData"));

      const workerManager = new WorkerManager({
        storage,
        workerScriptPath: path.join(__dirname, "taskEngine", "taskWorker.cjs"),
      });

      taskScheduler = new TaskScheduler({
        storage,
      });

      taskDispatcher = new TaskDispatcher({
        storage,
        workerManager,
      });

      taskScheduler.start();
      taskDispatcher.start();
    } catch (error) {
      console.error("[main] Failed to initialize better-sqlite3.");
      console.error("[main] Run: pnpm run rebuild:native");
      console.error(error);
      app.quit();
      return;
    }

    ipcMain.handle("desktop:notify", (_event, title, body) => {
      if (!Notification.isSupported()) {
        return false;
      }

      const notification = new Notification({ title, body });
      notification.show();
      return true;
    });

    ipcMain.handle("agent:chat", async (_event, payload) => {
      const runtime = await getRuntime();
      return runtime.runMultiAgentChat(payload);
    });

    ipcMain.handle(
      "agent:chat:stream/start",
      async (event, { streamId, payload }) => {
        if (!streamId || !payload) {
          throw new Error("Invalid stream start payload.");
        }

        const runtime = await getRuntime();
        const channel = `agent:chat:stream:${streamId}`;
        const controller = new AbortController();
        activeChatStreams.set(streamId, controller);

        const send = (data) => {
          if (!event.sender.isDestroyed()) {
            event.sender.send(channel, data);
          }
        };

        void (async () => {
          try {
            const result = await runtime.runMultiAgentChatStream({
              ...payload,
              signal: controller.signal,
              onChunk: (chunk) => send({ type: "chunk", chunk }),
              onLog: (log) => send({ type: "log", log }),
            });
            send({ type: "done", ...result });
          } catch (error) {
            send({
              type: "error",
              error: error instanceof Error ? error.message : String(error),
            });
          } finally {
            activeChatStreams.delete(streamId);
          }
        })();

        return true;
      },
    );

    ipcMain.handle("agent:chat:stream/cancel", (_event, streamId) => {
      const controller = activeChatStreams.get(streamId);
      if (!controller) {
        return false;
      }
      controller.abort();
      activeChatStreams.delete(streamId);
      return true;
    });

    ipcMain.handle("agent:task", async (_event, payload) => {
      const runtime = await getRuntime();
      return runtime.runTaskWorkflow(payload);
    });

    ipcMain.handle("task:create", (_event, payload) =>
      storage.createTaskDefinition(payload),
    );
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

    ipcMain.handle("db:bootstrap", () => storage.bootstrapData());
    ipcMain.handle("db:listChats", () => storage.listChats());
    ipcMain.handle("db:createChat", () => storage.createChat());
    ipcMain.handle("db:renameChat", (_event, chatId, title) =>
      storage.renameChat(chatId, title),
    );
    ipcMain.handle("db:deleteChat", (_event, chatId) =>
      storage.deleteChat(chatId),
    );
    ipcMain.handle("db:getChatMessages", (_event, chatId) =>
      storage.getChatMessages(chatId),
    );
    ipcMain.handle("db:appendMessage", (_event, message) =>
      storage.appendMessage(message),
    );
    ipcMain.handle("db:listTasks", () => storage.listTasks());
    ipcMain.handle("db:upsertTask", (_event, task) => storage.upsertTask(task));
    ipcMain.handle("db:getSettings", () => storage.getSettings());
    ipcMain.handle("db:saveSettings", (_event, settings) =>
      storage.saveSettings(settings),
    );

    createWindow();

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      }
    });
  })
  .catch((error) => {
    console.error("[main] Failed during app bootstrap:", error);
    app.quit();
  });

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  shutdownResources();
});
