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
let skillManager = null;
let shutdownPlaywrightMcp = null;
let shutdownFilesystemMcp = null;
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

async function withEnabledSkills(payload = {}) {
  const normalizedPayload =
    payload && typeof payload === "object" ? payload : {};

  if (!skillManager?.listEnabledSkillSpecs) {
    return normalizedPayload;
  }

  try {
    const enabledSkillSpecs = await skillManager.listEnabledSkillSpecs();
    return {
      ...normalizedPayload,
      enabledSkillSpecs,
    };
  } catch (error) {
    console.warn("[main] Failed to load enabled skill specs:", error);
    return normalizedPayload;
  }
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

  if (typeof shutdownPlaywrightMcp === "function") {
    void shutdownPlaywrightMcp().catch((error) => {
      console.error("[main] Failed to shutdown Playwright MCP:", error);
    });
  }

  if (typeof shutdownFilesystemMcp === "function") {
    void shutdownFilesystemMcp().catch((error) => {
      console.error("[main] Failed to shutdown Filesystem MCP:", error);
    });
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
      const { SkillManager } = require("./skillEngine/SkillManager.cjs");
      const {
        warmupPlaywrightMcp,
        shutdownPlaywrightMcp: shutdownPlaywrightMcpRuntime,
      } = require("./agentTools/playwrightMcpRuntime.cjs");
      const {
        warmupFilesystemMcp,
        shutdownFilesystemMcp: shutdownFilesystemMcpRuntime,
      } = require("./agentTools/filesystemMcpRuntime.cjs");
      storage = createStorage(app.getPath("userData"));
      skillManager = new SkillManager({
        userDataDir: app.getPath("userData"),
        builtinSkillsDir: path.join(__dirname, "skills_builtin"),
        logger: console,
      });
      void skillManager.init().catch((error) => {
        console.error("[main] Failed to initialize skill manager:", error);
      });

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

      shutdownPlaywrightMcp = shutdownPlaywrightMcpRuntime;
      shutdownFilesystemMcp = shutdownFilesystemMcpRuntime;
      void warmupPlaywrightMcp({
        onLog: (message) => console.info(message),
      }).catch((error) => {
        console.warn(
          `[main] Playwright MCP startup failed: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      });
      void warmupFilesystemMcp({
        onLog: (message) => console.info(message),
        baseDir: process.cwd(),
      }).catch((error) => {
        console.warn(
          `[main] Filesystem MCP startup failed: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
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
      return runtime.runMultiAgentChat(await withEnabledSkills(payload));
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
              ...(await withEnabledSkills(payload)),
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
      return runtime.runTaskWorkflow(await withEnabledSkills(payload));
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

    ipcMain.handle("skill:list", async () => {
      if (!skillManager) {
        return [];
      }
      return skillManager.listSkills();
    });
    ipcMain.handle("skill:listEnabled", async () => {
      if (!skillManager) {
        return [];
      }
      return skillManager.listEnabledSkills();
    });
    ipcMain.handle("skill:get", async (_event, id) => {
      if (!skillManager) {
        return null;
      }
      return skillManager.getSkillById(id);
    });
    ipcMain.handle("skill:install", async (_event, payload) => {
      if (!skillManager) {
        throw new Error("Skill manager is unavailable.");
      }
      return skillManager.installSkill(payload);
    });
    ipcMain.handle("skill:uninstall", async (_event, id) => {
      if (!skillManager) {
        return false;
      }
      return skillManager.uninstallSkill(id);
    });
    ipcMain.handle("skill:enable", async (_event, id) => {
      if (!skillManager) {
        return false;
      }
      return skillManager.enableSkill(id);
    });
    ipcMain.handle("skill:disable", async (_event, id) => {
      if (!skillManager) {
        return false;
      }
      return skillManager.disableSkill(id);
    });
    ipcMain.handle("skill:refresh", async () => {
      if (!skillManager) {
        return [];
      }
      return skillManager.listSkills();
    });

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
