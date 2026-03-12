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
const {
  buildPromptWithBudget,
  buildSummaryRefreshState,
  shouldRefreshSummary,
} = require("./chatContextManager.cjs");

const isDev = Boolean(process.env.VITE_DEV_SERVER_URL);
let storage = null;
let taskScheduler = null;
let taskDispatcher = null;
let skillManager = null;
let shutdownPlaywrightMcp = null;
let shutdownFilesystemMcp = null;
const activeChatStreams = new Map();
const activeChatMemoryRefreshes = new Map();
let shutdownHandled = false;

function shortChatId(chatId = "") {
  const value = String(chatId || "").trim();
  return value ? value.slice(0, 8) : "-";
}

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
    console.warn("[dev-local] 监听 dist 目录失败:", error);
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
    console.warn("[main] 加载已启用技能规格失败:", error);
    return normalizedPayload;
  }
}

function normalizeAgentPayload(payload = {}) {
  const source = payload && typeof payload === "object" ? payload : {};
  return {
    ...source,
    prompt: typeof source.prompt === "string" ? source.prompt : "",
    chatId: typeof source.chatId === "string" ? source.chatId.trim() : "",
    latestUserMessage:
      typeof source.latestUserMessage === "string" ? source.latestUserMessage : "",
    apiKey: typeof source.apiKey === "string" ? source.apiKey : "",
    langsmithEnabled: Boolean(source.langsmithEnabled),
    langsmithApiKey:
      typeof source.langsmithApiKey === "string" ? source.langsmithApiKey : "",
    langsmithProject:
      typeof source.langsmithProject === "string" ? source.langsmithProject : "",
    langsmithEndpoint:
      typeof source.langsmithEndpoint === "string" ? source.langsmithEndpoint : "",
    modelName:
      typeof source.modelName === "string" && source.modelName.trim()
        ? source.modelName.trim()
        : "gpt-4o-mini",
    baseUrl: typeof source.baseUrl === "string" ? source.baseUrl : "",
  };
}

async function prepareChatRuntimePayload(payload = {}) {
  const normalizedPayload = normalizeAgentPayload(payload);
  if (!storage) {
    return normalizedPayload;
  }

  if (!normalizedPayload.chatId) {
    return normalizedPayload;
  }

  const messages = storage.getChatMessages(normalizedPayload.chatId);
  const memory = storage.getChatMemory(normalizedPayload.chatId);
  const chatContext = buildPromptWithBudget(messages, memory, {
    latestUserMessage: normalizedPayload.latestUserMessage,
    modelName: normalizedPayload.modelName,
  });

  console.info(
    `[聊天记忆] 已构建提示词 chat=${shortChatId(normalizedPayload.chatId)} ` +
      `摘要Token=${chatContext.summaryTokens} ` +
      `历史消息数=${chatContext.historyMessages.length} ` +
      `预计Token=${chatContext.tokenEstimate.estimatedTotalTokens}/` +
      `${chatContext.tokenEstimate.inputBudgetTokens}`,
  );

  return {
    ...normalizedPayload,
    prompt: chatContext.prompt,
    latestUserMessage: chatContext.latestUserMessage,
    chatContext,
  };
}

async function refreshChatMemory(payload = {}) {
  const normalizedPayload = normalizeAgentPayload(payload);
  if (!storage || !normalizedPayload.chatId) {
    return null;
  }

  const existing = activeChatMemoryRefreshes.get(normalizedPayload.chatId);
  if (existing) {
    return existing;
  }

  const task = (async () => {
    const runtime = await getRuntime();
    const messages = storage.getChatMessages(normalizedPayload.chatId);
    const memory = storage.getChatMemory(normalizedPayload.chatId);
    const refreshState = buildSummaryRefreshState(messages, memory, {
      modelName: normalizedPayload.modelName,
    });

    if (!shouldRefreshSummary(refreshState)) {
      console.info(
        `[聊天记忆] 跳过摘要刷新 chat=${shortChatId(normalizedPayload.chatId)} ` +
          `过渡区Token=${refreshState.transitionTokens}`,
      );
      return memory;
    }

    const lastTransitionMessage = refreshState.transitionMessages.at(-1);
    if (!lastTransitionMessage) {
      console.info(
        `[聊天记忆] 跳过摘要刷新 chat=${shortChatId(normalizedPayload.chatId)} ` +
          `原因=没有可摘要的过渡消息`,
      );
      return memory;
    }

    console.info(
      `[聊天记忆] 开始刷新摘要 chat=${shortChatId(normalizedPayload.chatId)} ` +
        `过渡消息数=${refreshState.transitionMessages.length} ` +
        `过渡区Token=${refreshState.transitionTokens}`,
    );

    try {
      const result = await runtime.runConversationSummary({
        previousSummary: refreshState.summaryText,
        historyText: refreshState.transitionText,
        apiKey: normalizedPayload.apiKey,
        modelName: normalizedPayload.modelName,
        baseUrl: normalizedPayload.baseUrl,
        onLog: (message) => console.info(message),
      });

      if (!result?.applied) {
        console.info(
          `[聊天记忆] 摘要结果未生效 chat=${shortChatId(normalizedPayload.chatId)}`,
        );
        return memory;
      }

      const nextMemory = {
        chatId: normalizedPayload.chatId,
        summaryText: result.summaryText,
        coveredUntilTimestamp: lastTransitionMessage.timestamp,
        updatedAt: Date.now(),
      };
      storage.saveChatMemory(nextMemory);
      console.info(
        `[聊天记忆] 摘要已保存 chat=${shortChatId(normalizedPayload.chatId)} ` +
          `覆盖到=${lastTransitionMessage.timestamp}`,
      );
      return nextMemory;
    } catch (error) {
      console.warn(
        `[聊天记忆] 摘要刷新失败 chat=${shortChatId(normalizedPayload.chatId)}`,
        error,
      );
      return memory;
    }
  })();

  activeChatMemoryRefreshes.set(normalizedPayload.chatId, task);
  try {
    return await task;
  } finally {
    if (activeChatMemoryRefreshes.get(normalizedPayload.chatId) === task) {
      activeChatMemoryRefreshes.delete(normalizedPayload.chatId);
    }
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
      console.error("[main] 停止任务调度器失败:", error);
    }
  }

  if (taskDispatcher?.stop) {
    try {
      taskDispatcher.stop();
    } catch (error) {
      console.error("[main] 停止任务分发器失败:", error);
    }
  }

  if (storage?.close) {
    try {
      storage.close();
    } catch (error) {
      console.error("[main] 关闭 SQLite 存储失败:", error);
    }
  }

  if (typeof shutdownPlaywrightMcp === "function") {
    void shutdownPlaywrightMcp().catch((error) => {
      console.error("[main] 关闭 Playwright MCP 失败:", error);
    });
  }

  if (typeof shutdownFilesystemMcp === "function") {
    void shutdownFilesystemMcp().catch((error) => {
      console.error("[main] 关闭 Filesystem MCP 失败:", error);
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
      const { setStorage } = require("./storageContext.cjs");
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
      setStorage(storage);
      skillManager = new SkillManager({
        userDataDir: app.getPath("userData"),
        builtinSkillsDir: path.join(__dirname, "skills_builtin"),
        logger: console,
      });
      void skillManager.init().catch((error) => {
        console.error("[main] 初始化技能管理器失败:", error);
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
          `[main] Playwright MCP 启动失败: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      });
      void warmupFilesystemMcp({
        onLog: (message) => console.info(message),
        baseDir: process.cwd(),
      }).catch((error) => {
        console.warn(
          `[main] Filesystem MCP 启动失败: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      });

      taskScheduler.start();
      taskDispatcher.start();
    } catch (error) {
      console.error("[main] 初始化 better-sqlite3 失败。");
      console.error("[main] 请执行：pnpm run rebuild:native");
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
      const preparedPayload = await prepareChatRuntimePayload(payload);
      return runtime.runMultiAgentChat(await withEnabledSkills(preparedPayload));
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
            const preparedPayload = await prepareChatRuntimePayload(payload);
            const result = await runtime.runMultiAgentChatStream({
              ...(await withEnabledSkills(preparedPayload)),
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

    ipcMain.handle("agent:run:listByTaskRun", (_event, taskRunId) =>
      storage.listAgentRunsByTaskRun(taskRunId),
    );
    ipcMain.handle("agent:run:steps", (_event, agentRunId) =>
      storage.listAgentStepsByRun(agentRunId),
    );
    ipcMain.handle("agent:run:toolCalls", (_event, agentRunId) =>
      storage.listToolCallsByRun(agentRunId),
    );

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
    ipcMain.handle("db:getChatMemory", (_event, chatId) =>
      storage.getChatMemory(chatId),
    );
    ipcMain.handle("db:refreshChatMemory", async (_event, payload) =>
      refreshChatMemory(payload),
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
    console.error("[main] 应用启动阶段失败:", error);
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
