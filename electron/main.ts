import { app, BrowserWindow, ipcMain, session } from "electron";
import path from "node:path";
import fs from "node:fs";
import { defaultServices } from "./services";
import { getStore, type StoreSchema } from "./store";

const isDev = !app.isPackaged;
let mainWindow: BrowserWindow | null = null;

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

  return win;
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

  ipcMain.handle("store:get-all", () => store.store);
  ipcMain.handle("store:set", (_event, patch: Partial<StoreSchema>) => {
    store.set(patch);
    return store.store;
  });

  store.onDidAnyChange((newValue) => {
    mainWindow?.webContents.send("store:changed", newValue);
  });

  mainWindow = createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) mainWindow = createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
