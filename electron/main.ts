import { app, BrowserWindow, ipcMain, Menu, screen, session, Tray } from "electron";
import path from "node:path";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { defaultServices } from "./services";
import { getStore, type StoreSchema } from "./store";

// This file intentionally does NOT set --ozone-platform or --no-sandbox
// via app.commandLine.appendSwitch()/process.env — both were tried here and
// neither is reliably early enough (see scripts/afterPack.cjs for the full
// story and why both flags instead get passed as real process arguments by
// a launcher-script wrapper around the packaged Linux binary). For dev,
// the `dev:electron` npm script passes --ozone-platform=x11 as a literal
// CLI arg to `electron .` for the same reason.
const isDev = !app.isPackaged;
let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuitting = false;

interface NotificationPayload {
  serviceId: string;
  title: string;
  body: string;
}

const POPUP_WIDTH = 360;
const POPUP_HEIGHT = 100;
const POPUP_MARGIN = 16;
const POPUP_DURATION_MS = 6000;

let notificationWindow: BrowserWindow | null = null;
const notificationQueue: NotificationPayload[] = [];
let notificationTimer: ReturnType<typeof setTimeout> | null = null;
let notificationShowing = false;

function stripFrameHeaders(ses: Electron.Session) {
  ses.webRequest.onHeadersReceived((details, callback) => {
    const headers = details.responseHeaders ?? {};
    for (const key of Object.keys(headers)) {
      const lower = key.toLowerCase();
      if (
        lower === "x-frame-options" ||
        lower === "content-security-policy" ||
        lower === "content-security-policy-report-only"
      ) {
        delete headers[key];
      }
    }
    callback({ responseHeaders: headers });
  });
}

function createWindow() {
  const iconPath = path.join(__dirname, "../build/icon.png");

  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    title: "ET Dashboard",
    icon: fs.existsSync(iconPath) ? iconPath : undefined,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true,
    },
  });

  if (isDev) {
    win.loadURL("http://localhost:3000");
    win.webContents.openDevTools({ mode: "detach" });
  } else {
    win.loadFile(path.join(__dirname, "../out/index.html"));
  }

  // Closing the window minimizes to the tray instead of quitting — the tray's
  // own "Salir" item (or Cmd/Ctrl+Q) is what actually exits the app.
  win.on("close", (event) => {
    if (isQuitting) return;
    event.preventDefault();
    win.hide();
  });

  return win;
}

function createTray(win: BrowserWindow) {
  const iconPath = path.join(__dirname, "../build/tray-icon.png");
  if (!fs.existsSync(iconPath)) {
    console.log("[tray] icon not found at", iconPath, "— skipping tray creation");
    return;
  }

  tray = new Tray(iconPath);
  tray.setToolTip("ET Dashboard");
  console.log("[tray] created");

  function toggleWindow() {
    if (win.isVisible()) {
      win.hide();
    } else {
      win.show();
      win.focus();
    }
  }

  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: "Mostrar",
        click: () => {
          win.show();
          win.focus();
        },
      },
      { label: "Ocultar", click: () => win.hide() },
      { type: "separator" },
      {
        label: "Salir",
        click: () => {
          isQuitting = true;
          app.quit();
        },
      },
    ]),
  );

  tray.on("click", toggleWindow);
}

// A separate frameless, transparent, always-on-top window for notifications —
// a native OS Notification can't be styled at all (fully OS-rendered), and an
// in-page toast only exists while the main window is visible. This one is its
// own window, so it shows up in the corner of the screen regardless of
// whether the main window is hidden in the tray, like Discord/Slack toasts.
// It's created once and reused (content + position updated, then
// shown/hidden) rather than recreated per notification.
function createNotificationWindow() {
  const win = new BrowserWindow({
    width: POPUP_WIDTH,
    height: POPUP_HEIGHT,
    frame: false,
    transparent: true,
    hasShadow: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    focusable: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (isDev) {
    win.loadURL("http://localhost:3000/notification");
  } else {
    win.loadFile(path.join(__dirname, "../out/notification.html"));
  }

  return win;
}

function positionNotificationWindow(win: BrowserWindow) {
  const { workArea } = screen.getPrimaryDisplay();
  win.setBounds({
    x: workArea.x + workArea.width - POPUP_WIDTH - POPUP_MARGIN,
    y: workArea.y + POPUP_MARGIN,
    width: POPUP_WIDTH,
    height: POPUP_HEIGHT,
  });
}

function showNextNotification() {
  if (notificationShowing || notificationQueue.length === 0 || !notificationWindow) return;
  const payload = notificationQueue.shift();
  if (!payload) return;

  notificationShowing = true;
  positionNotificationWindow(notificationWindow);
  notificationWindow.webContents.send("notification-data", payload);
  notificationWindow.showInactive();

  notificationTimer = setTimeout(() => {
    notificationWindow?.hide();
    notificationShowing = false;
    showNextNotification();
  }, POPUP_DURATION_MS);
}

function dismissCurrentNotification() {
  if (notificationTimer) {
    clearTimeout(notificationTimer);
    notificationTimer = null;
  }
  notificationWindow?.hide();
  notificationShowing = false;
  showNextNotification();
}

app.whenReady().then(async () => {
  for (const service of defaultServices) {
    stripFrameHeaders(session.fromPartition(service.partition));
  }

  app.on("web-contents-created", (_event, contents) => {
    if (contents.getType() !== "webview") return;
    contents.on("did-fail-load", (_e, errorCode, errorDescription, validatedURL) => {
      console.log("[webview] FAILED:", errorCode, errorDescription, validatedURL);
    });
  });

  const store = await getStore();

  ipcMain.handle("get-webview-preload-path", () =>
    pathToFileURL(path.join(__dirname, "webview-preload.js")).toString(),
  );

  ipcMain.on("show-notification", (_event, payload: NotificationPayload) => {
    notificationQueue.push(payload);
    showNextNotification();
  });

  ipcMain.on("activate-notification-service", (_event, serviceId: string) => {
    mainWindow?.show();
    mainWindow?.focus();
    mainWindow?.webContents.send("notification-clicked", serviceId);
    dismissCurrentNotification();
  });

  ipcMain.on("close-notification-popup", () => {
    dismissCurrentNotification();
  });

  ipcMain.handle("store:get-all", () => store.store);
  ipcMain.handle("store:set", (_event, patch: Partial<StoreSchema>) => {
    store.set(patch);
    return store.store;
  });

  store.onDidAnyChange((newValue) => {
    mainWindow?.webContents.send("store:changed", newValue);
  });

  mainWindow = createWindow();
  createTray(mainWindow);
  notificationWindow = createNotificationWindow();

  app.on("activate", () => {
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    } else {
      mainWindow = createWindow();
    }
  });

  app.on("before-quit", () => {
    isQuitting = true;
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
