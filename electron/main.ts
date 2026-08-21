import { app, BrowserWindow, ipcMain, Menu, nativeImage, screen, session, shell, Tray } from "electron";
import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { defaultServices } from "./services";
import { getStore, type StoreSchema } from "./store";
import { deleteNote, listNotes, saveNote, type Note } from "./notesStore";

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

// Matches package.json's build.publish (owner/repo) — where the GitHub
// Actions release pipeline (.github/workflows/release.yml) publishes tagged
// builds via electron-builder.
const RELEASES_REPO = "amingarro/ET-Dasboard";

interface UpdateCheckResult {
  currentVersion: string;
  latestVersion: string | null;
  updateAvailable: boolean;
  releaseUrl: string | null;
  error: string | null;
}

/** Numeric semver compare, "v" prefix optional on either side. Returns >0 if
 * `a` is newer than `b`. Missing/non-numeric parts are treated as 0, which is
 * enough for this project's plain MAJOR.MINOR.PATCH tags. */
function compareVersions(a: string, b: string): number {
  const clean = (v: string) => v.replace(/^v/, "").split(".").map((n) => parseInt(n, 10) || 0);
  const partsA = clean(a);
  const partsB = clean(b);
  for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
    const diff = (partsA[i] ?? 0) - (partsB[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

async function checkForUpdates(): Promise<UpdateCheckResult> {
  const currentVersion = app.getVersion();
  try {
    const res = await fetch(`https://api.github.com/repos/${RELEASES_REPO}/releases/latest`, {
      headers: { Accept: "application/vnd.github+json" },
    });
    // A repo with no published GitHub Release yet 404s here — that's an
    // expected state (this project's release workflow is manual/on-demand),
    // not a real failure, so it's reported as "no releases" rather than an
    // error.
    if (res.status === 404) {
      return {
        currentVersion,
        latestVersion: null,
        updateAvailable: false,
        releaseUrl: null,
        error: null,
      };
    }
    if (!res.ok) throw new Error(`GitHub API respondió ${res.status}`);
    const data = (await res.json()) as { tag_name?: string; html_url?: string };
    const latestVersion = data.tag_name ?? null;
    return {
      currentVersion,
      latestVersion,
      updateAvailable: Boolean(latestVersion && compareVersions(latestVersion, currentVersion) > 0),
      releaseUrl: data.html_url ?? null,
      error: null,
    };
  } catch (err) {
    return {
      currentVersion,
      latestVersion: null,
      updateAvailable: false,
      releaseUrl: null,
      error: err instanceof Error ? err.message : "No se pudo comprobar actualizaciones",
    };
  }
}

interface GithubAsset {
  name: string;
  browser_download_url: string;
  size: number;
}

// electron-updater (the standard library) can't update a .deb in place — it
// only knows how to replace an AppImage or a Windows NSIS install with
// itself. This app ships as a .deb, managed by apt/dpkg, so "updating"
// instead means: fetch the newest .deb asset, download it, and hand it to
// `apt install` — the same thing installing it by hand does, just automated
// behind one button. `pkexec` shows the normal graphical polkit password
// prompt (same one used to install the very first time), since writing to
// /opt and /usr/share always needs root regardless of who triggers it.
async function downloadAndInstallDebUpdate(onProgress: (percent: number) => void): Promise<void> {
  const res = await fetch(`https://api.github.com/repos/${RELEASES_REPO}/releases/latest`, {
    headers: { Accept: "application/vnd.github+json" },
  });
  if (!res.ok) throw new Error(`GitHub API respondió ${res.status}`);
  const data = (await res.json()) as { assets?: GithubAsset[] };
  const debAsset = data.assets?.find((a) => a.name.endsWith("_amd64.deb"));
  if (!debAsset) throw new Error("No se encontró el paquete .deb en la última versión");

  const tempPath = path.join(os.tmpdir(), debAsset.name);
  const downloadRes = await fetch(debAsset.browser_download_url);
  if (!downloadRes.ok || !downloadRes.body) {
    throw new Error(`No se pudo descargar el paquete (${downloadRes.status})`);
  }

  const total = Number(downloadRes.headers.get("content-length")) || debAsset.size;
  let downloaded = 0;
  const fileHandle = fs.createWriteStream(tempPath);
  const reader = downloadRes.body.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      downloaded += value.length;
      fileHandle.write(value);
      if (total > 0) onProgress((downloaded / total) * 100);
    }
  } finally {
    await new Promise<void>((resolve) => fileHandle.end(resolve));
  }

  await new Promise<void>((resolve, reject) => {
    const child = spawn("pkexec", ["apt", "install", "-y", tempPath]);
    let stderr = "";
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      fs.unlink(tempPath, () => {});
      if (code === 0) resolve();
      else reject(new Error(stderr.trim() || `apt terminó con código ${code}`));
    });
  });
}

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
  // Passing `icon` as a string to the BrowserWindow constructor doesn't
  // reliably set the X11 _NET_WM_ICON hint under the ozone-platform=x11
  // config this app runs with — GNOME's taskbar/dash/Alt-Tab then falls
  // back to a generic icon. Load it as a nativeImage and call setIcon()
  // explicitly below as a second, more direct path to the same hint.
  const appIcon = fs.existsSync(iconPath) ? nativeImage.createFromPath(iconPath) : undefined;

  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    title: "ET Dashboard",
    icon: appIcon,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true,
    },
  });

  if (appIcon && !appIcon.isEmpty()) {
    win.setIcon(appIcon);
  }

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
  // Removes Electron's default File/Edit/View/Window menu bar — this app has
  // no use for it (no File/Edit actions of its own) and it also shows up on
  // the detached DevTools window in dev.
  Menu.setApplicationMenu(null);

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

  ipcMain.handle("check-for-updates", () => checkForUpdates());
  ipcMain.on("open-external", (_event, url: string) => {
    shell.openExternal(url);
  });

  ipcMain.handle("download-update", async () => {
    if (!app.isPackaged) return { error: "No disponible en modo desarrollo." };
    if (process.platform !== "linux") {
      return { error: "La actualización con un click todavía solo está disponible en Linux." };
    }
    try {
      await downloadAndInstallDebUpdate((percent) => {
        mainWindow?.webContents.send("update-download-progress", percent);
      });
      mainWindow?.webContents.send("update-installed");
      return { error: null };
    } catch (err) {
      const message = err instanceof Error ? err.message : "No se pudo actualizar";
      mainWindow?.webContents.send("update-error", message);
      return { error: message };
    }
  });
  ipcMain.on("relaunch-app", () => {
    app.relaunch();
    app.exit();
  });

  ipcMain.handle("store:get-all", () => store.store);
  ipcMain.handle("store:set", (_event, patch: Partial<StoreSchema>) => {
    store.set(patch);
    return store.store;
  });

  // Notes live in their own one-file-per-note directory instead of the
  // electron-store config above — see notesStore.ts for why.
  ipcMain.handle("notes:list", () => listNotes());
  ipcMain.handle("notes:save", (_event, note: Note) => saveNote(note));
  ipcMain.handle("notes:delete", (_event, id: string) => deleteNote(id));

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
