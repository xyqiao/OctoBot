const { app, BrowserWindow } = require("electron");
const path = require("path");
const { pathToFileURL } = require("url");
const { createWindow } = require("./window/windowManager.cjs");
const { registerChatHandlers } = require("./ipc/chatHandlers.cjs");
const { registerTaskHandlers } = require("./ipc/taskHandlers.cjs");
const { registerSkillHandlers } = require("./ipc/skillHandlers.cjs");
const { registerMiscHandlers } = require("./ipc/miscHandlers.cjs");
const { prepareChatRuntimePayload, refreshChatMemory } = require("./chat/chatMemoryManager.cjs");

const isDev = Boolean(process.env.VITE_DEV_SERVER_URL);
let storage = null;
let taskScheduler = null;
let taskDispatcher = null;
let skillManager = null;
let shutdownPlaywrightMcp = null;
let shutdownFilesystemMcp = null;
let shutdownWebSearchMcp = null;
const activeChatStreams = new Map();
const activeChatMemoryRefreshes = new Map();
let shutdownHandled = false;

function runtimeModuleUrl() {
  return pathToFileURL(path.join(__dirname, "runtime/index.mjs")).href;
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

  if (typeof shutdownWebSearchMcp === "function") {
    void shutdownWebSearchMcp().catch((error) => {
      console.error("[main] 关闭 Web Search MCP 失败:", error);
    });
  }
}

app
  .whenReady()
  .then(() => {
    try {
      const { createStorage } = require("./storage/index.cjs");
      const { setStorage } = require("./storage/context.cjs");
      const { TaskScheduler } = require("./taskEngine/TaskScheduler.cjs");
      const { TaskDispatcher } = require("./taskEngine/TaskDispatcher.cjs");
      const { WorkerManager } = require("./taskEngine/WorkerManager.cjs");
      const { SkillManager } = require("./skillEngine/SkillManager.cjs");
      const {
        warmupPlaywrightMcp,
        shutdownPlaywrightMcp: shutdownPlaywrightMcpRuntime,
      } = require("./integrations/mcp/playwrightMcpRuntime.cjs");
      const {
        warmupFilesystemMcp,
        shutdownFilesystemMcp: shutdownFilesystemMcpRuntime,
      } = require("./integrations/mcp/filesystemMcpRuntime.cjs");
      const {
        warmupWebSearchMcp,
        shutdownWebSearchMcp: shutdownWebSearchMcpRuntime,
      } = require("./integrations/mcp/webSearchMcpRuntime.cjs");

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
      shutdownWebSearchMcp = shutdownWebSearchMcpRuntime;

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
      void warmupWebSearchMcp({
        onLog: (message) => console.info(message),
      }).catch((error) => {
        console.warn(
          `[main] Web Search MCP 启动失败: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      });

      taskScheduler.start();
      taskDispatcher.start();

      // Register IPC handlers
      registerChatHandlers({
        storage,
        getRuntime,
        withEnabledSkills,
        prepareChatRuntimePayload: (payload) => prepareChatRuntimePayload(storage, payload),
        refreshChatMemory: (payload) => refreshChatMemory(storage, getRuntime, activeChatMemoryRefreshes, payload),
        activeChatStreams,
      });

      registerTaskHandlers({
        storage,
        getRuntime,
        withEnabledSkills,
        taskDispatcher,
      });

      registerSkillHandlers({
        skillManager,
      });

      registerMiscHandlers({
        storage,
      });
    } catch (error) {
      console.error("[main] 初始化 better-sqlite3 失败。");
      console.error("[main] 请执行：pnpm run rebuild:native");
      console.error(error);
      app.quit();
      return;
    }

    createWindow(isDev);

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow(isDev);
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
