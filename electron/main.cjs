const { app, BrowserWindow, ipcMain, Notification, shell } = require("electron");
const fs = require("fs");
const path = require("path");
const { pathToFileURL } = require("url");

const isDev = Boolean(process.env.VITE_DEV_SERVER_URL);
let storage = null;

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
    },
  });

  if (isDev) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    win.loadFile(path.join(__dirname, "../dist/index.html"));

    if (process.env.ELECTRON_WATCH === "1") {
      watchDistAndReload(win);
    }
  }

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
}

app
  .whenReady()
  .then(() => {
  try {
    const { createStorage } = require("./sqliteStorage.cjs");
    storage = createStorage(app.getPath("userData"));
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

  ipcMain.handle("agent:task", async (_event, payload) => {
    const runtime = await getRuntime();
    return runtime.runTaskWorkflow(payload);
  });

  ipcMain.handle("db:bootstrap", () => storage.bootstrapData());
  ipcMain.handle("db:listChats", () => storage.listChats());
  ipcMain.handle("db:getChatMessages", (_event, chatId) => storage.getChatMessages(chatId));
  ipcMain.handle("db:appendMessage", (_event, message) => storage.appendMessage(message));
  ipcMain.handle("db:listTasks", () => storage.listTasks());
  ipcMain.handle("db:upsertTask", (_event, task) => storage.upsertTask(task));
  ipcMain.handle("db:getSettings", () => storage.getSettings());
  ipcMain.handle("db:saveSettings", (_event, settings) => storage.saveSettings(settings));

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
