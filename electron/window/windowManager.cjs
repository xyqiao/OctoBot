/**
 * Window management utilities
 */

const { BrowserWindow, shell } = require("electron");
const fs = require("fs");
const path = require("path");
const { pathToFileURL } = require("url");

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

function createWindow(isDev) {
  const win = new BrowserWindow({
    width: 1660,
    height: 1020,
    minWidth: 1280,
    minHeight: 820,
    backgroundColor: "#eef2f8",
    webPreferences: {
      preload: path.join(__dirname, "../preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
    },
  });

  const appInternalUrl = isDev
    ? process.env.VITE_DEV_SERVER_URL ?? ""
    : pathToFileURL(path.join(__dirname, "../../dist/index.html")).href;

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
    win.loadFile(path.join(__dirname, "../../dist/index.html"));

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

  return win;
}

module.exports = { createWindow };
