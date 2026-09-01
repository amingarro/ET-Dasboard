import {
  app,
  BrowserWindow,
  clipboard,
  ipcMain,
  Menu,
  nativeImage,
  net,
  protocol,
  screen,
  session,
  shell,
  Tray,
} from "electron";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { defaultServices } from "./services";
import { getStore, type StoreSchema } from "./store";
import { deleteNote, listNotes, saveNote, type Note } from "./notesStore";
import { deleteBirthday, listBirthdays, saveBirthday, type Birthday } from "./birthdaysStore";
import { downloadPendingImages, syncNotes, type SyncStatus } from "./driveSync";
import { getImagePath, saveImageBytes } from "./imagesStore";
import { markNoteDeleted } from "./syncState";

// Privilegiado para que se comporte como un origen seguro normal (fetchable,
// sin sorpresas de CORS) dentro del renderer, que a su vez carga sobre
// file://. Debe correr antes de app.whenReady() — Electron ignora este
// llamado después.
protocol.registerSchemesAsPrivileged([
  { scheme: "note-image", privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);

// This file intentionally does NOT set --ozone-platform or --no-sandbox
// via app.commandLine.appendSwitch()/process.env — both were tried here and
// neither is reliably early enough (see scripts/afterPack.cjs for the full
// story and why both flags instead get passed as real process arguments by
// a launcher-script wrapper around the packaged Linux binary). For dev,
// the `dev:electron` npm script passes --ozone-platform=x11 as a literal
// CLI arg to `electron .` for the same reason.
const isDev = !app.isPackaged;

// .env.local (gitignored) only exists on dev machines and is optional — the
// real Drive OAuth client is baked into driveSync.ts as a fallback (safe to
// commit, see the comment there), so packaged builds work without this file.
// This just lets a local .env.local swap in a different client for testing.
if (isDev) {
  try {
    const raw = fs.readFileSync(path.join(__dirname, "../.env.local"), "utf-8");
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      if (!(key in process.env)) process.env[key] = trimmed.slice(eq + 1).trim();
    }
  } catch {
    // No .env.local yet — Drive sync just reports itself as unconfigured.
  }
}

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

// Unlike a .deb, the NSIS installer this app ships as on Windows *can*
// replace itself while running — but not while running, period: Windows
// locks the executable of a running process, so the installer can't
// overwrite it until this app has fully exited. So only the download
// happens here; installing is deferred to the "Reiniciar ahora" step
// (relaunch-app below), which is the one that actually calls app.exit().
// The installer is run with "/S --force-run" — silent install, then launch
// the new version itself once done (electron-builder's NSIS template
// supports this combination natively; it's the same mechanism
// electron-updater's own NsisUpdater uses under the hood).
let pendingWindowsInstallerPath: string | null = null;

async function downloadWindowsInstaller(onProgress: (percent: number) => void): Promise<void> {
  const res = await fetch(`https://api.github.com/repos/${RELEASES_REPO}/releases/latest`, {
    headers: { Accept: "application/vnd.github+json" },
  });
  if (!res.ok) throw new Error(`GitHub API respondió ${res.status}`);
  const data = (await res.json()) as { assets?: GithubAsset[] };
  const exeAsset = data.assets?.find((a) => a.name.endsWith(".exe"));
  if (!exeAsset) throw new Error("No se encontró el instalador en la última versión");

  const tempPath = path.join(os.tmpdir(), exeAsset.name);
  const downloadRes = await fetch(exeAsset.browser_download_url);
  if (!downloadRes.ok || !downloadRes.body) {
    throw new Error(`No se pudo descargar el instalador (${downloadRes.status})`);
  }

  const total = Number(downloadRes.headers.get("content-length")) || exeAsset.size;
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

  pendingWindowsInstallerPath = tempPath;
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

  // Sirve las imágenes de las notas directo desde la caché local — el
  // renderer nunca toca el filesystem por su cuenta (el preload está
  // sandboxeado, ver las notas sobre preload.ts en otra parte de este
  // codebase), solo apunta un <img> a note-image://<id>.<ext> y esto lo resuelve.
  protocol.handle("note-image", async (request) => {
    const filename = decodeURIComponent(new URL(request.url).hostname);
    const filePath = await getImagePath(filename);
    return net.fetch(pathToFileURL(filePath).toString());
  });

  for (const service of defaultServices) {
    stripFrameHeaders(session.fromPartition(service.partition));
  }

  app.on("web-contents-created", (_event, contents) => {
    if (contents.getType() !== "webview") return;
    contents.on("did-fail-load", (_e, errorCode, errorDescription, validatedURL) => {
      console.log("[webview] FAILED:", errorCode, errorDescription, validatedURL);
    });

    // Electron shows no context menu at all by default, for a webview or
    // otherwise — every embedded page silently swallowed right-clicks until
    // this was wired up by hand.
    contents.on("context-menu", (_e, params) => {
      const items: Electron.MenuItemConstructorOptions[] = [];

      if (params.linkURL) {
        items.push(
          { label: "Abrir enlace en el navegador", click: () => shell.openExternal(params.linkURL) },
          { label: "Copiar dirección del enlace", click: () => clipboard.writeText(params.linkURL) },
          { type: "separator" },
        );
      }

      if (params.isEditable && params.misspelledWord) {
        if (params.dictionarySuggestions.length > 0) {
          for (const suggestion of params.dictionarySuggestions) {
            items.push({ label: suggestion, click: () => contents.replaceMisspelling(suggestion) });
          }
        } else {
          items.push({ label: "Sin sugerencias", enabled: false });
        }
        items.push(
          {
            label: "Añadir al diccionario",
            click: () => contents.session.addWordToSpellCheckerDictionary(params.misspelledWord),
          },
          { type: "separator" },
        );
      }

      if (params.isEditable) {
        items.push(
          { label: "Cortar", enabled: params.editFlags.canCut, click: () => contents.cut() },
          { label: "Copiar", enabled: params.editFlags.canCopy, click: () => contents.copy() },
          { label: "Pegar", enabled: params.editFlags.canPaste, click: () => contents.paste() },
          {
            label: "Seleccionar todo",
            enabled: params.editFlags.canSelectAll,
            click: () => contents.selectAll(),
          },
          { type: "separator" },
        );
      } else if (params.selectionText) {
        items.push(
          { label: "Copiar", click: () => clipboard.writeText(params.selectionText) },
          { type: "separator" },
        );
      }

      items.push(
        {
          label: "Atrás",
          enabled: contents.navigationHistory.canGoBack(),
          click: () => contents.navigationHistory.goBack(),
        },
        {
          label: "Adelante",
          enabled: contents.navigationHistory.canGoForward(),
          click: () => contents.navigationHistory.goForward(),
        },
        { label: "Recargar", click: () => contents.reload() },
      );

      Menu.buildFromTemplate(items).popup();
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
    if (process.platform !== "linux" && process.platform !== "win32") {
      return { error: "La actualización con un click todavía solo está disponible en Linux y Windows." };
    }
    try {
      if (process.platform === "linux") {
        await downloadAndInstallDebUpdate((percent) => {
          mainWindow?.webContents.send("update-download-progress", percent);
        });
      } else {
        await downloadWindowsInstaller((percent) => {
          mainWindow?.webContents.send("update-download-progress", percent);
        });
      }
      mainWindow?.webContents.send("update-installed");
      return { error: null };
    } catch (err) {
      const message = err instanceof Error ? err.message : "No se pudo actualizar";
      mainWindow?.webContents.send("update-error", message);
      return { error: message };
    }
  });
  ipcMain.on("relaunch-app", () => {
    if (pendingWindowsInstallerPath) {
      spawn(pendingWindowsInstallerPath, ["/S", "--force-run"], { detached: true, stdio: "ignore" }).unref();
      app.exit();
      return;
    }
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
  ipcMain.handle("notes:delete", async (_event, id: string) => {
    await deleteNote(id);
    // La marca como tombstone para que el próximo sync también borre la
    // copia en Drive, en vez de tratar "desapareció local, sigue en Drive"
    // como "hay que volver a bajarla".
    await markNoteDeleted(id);
  });

  // El renderer no puede tocar el filesystem por su cuenta (el preload está
  // sandboxeado) — el editor de texto enriquecido manda los bytes crudos de
  // la imagen y recibe de vuelta el id que debe referenciar como
  // note-image://{id}.{ext} en el bodyHtml de la nota.
  ipcMain.handle("notes:save-image", async (_event, payload: { dataBase64: string; fileName: string }) => {
    const ext = (path.extname(payload.fileName).slice(1) || "png").toLowerCase();
    const id = randomUUID();
    const filename = `${id}.${ext}`;
    await saveImageBytes(filename, Buffer.from(payload.dataBase64, "base64"));
    return { filename };
  });

  // Birthdays: a single flat JSON file (not one-per-note) since it's just a
  // small name+date list — see birthdaysStore.ts.
  ipcMain.handle("birthdays:list", () => listBirthdays());
  ipcMain.handle("birthdays:save", (_event, birthday: Birthday) => saveBirthday(birthday));
  ipcMain.handle("birthdays:delete", (_event, id: string) => deleteBirthday(id));

  // Los errores de Node/fetch (fallas de red, una respuesta malformada, etc.)
  // vienen en inglés — nunca hay que mandarlos tal cual a la UI. El detalle
  // real igual va a la terminal para debuggear.
  function describeSyncError(err: unknown): string {
    console.error("[drive sync]", err);
    return "No se pudo completar la sincronización con Drive. Mirá la consola de la app para más detalles.";
  }

  // Auto-sync (debounced, on every note edit) and the manual button can both
  // fire close together — coalesce into whichever sync is already running
  // instead of letting two overlap and race on the same Drive folder.
  let inFlightSync: Promise<{ ok: boolean; uploaded?: number; error?: string }> | null = null;

  ipcMain.handle("drive:sync", () => {
    if (inFlightSync) return inFlightSync;

    inFlightSync = (async () => {
      try {
        const result = await syncNotes((status: SyncStatus) =>
          mainWindow?.webContents.send("drive-sync-status", status),
        );
        // Un pull puede haber sobrescrito archivos de notas locales sin que
        // el renderer se entere — de otro modo solo conoce su propia lista
        // en memoria.
        if (result.downloaded > 0) mainWindow?.webContents.send("notes-changed");
        if (result.pendingImages.length > 0) {
          mainWindow?.webContents.send("drive-images-pending", result.pendingImages);
        }
        return { ok: true as const, uploaded: result.uploaded };
      } catch (err) {
        // Los errores que lanzamos nosotros (driveSync.ts) ya están en
        // español; cualquier otra cosa (un fetch/TypeError crudo de Node)
        // viene en inglés y nunca debe llegar así a la UI — se loguea para
        // debuggear y se muestra un mensaje fijo en español en su lugar.
        const message = describeSyncError(err);
        mainWindow?.webContents.send("drive-sync-status", { phase: "error", message });
        return { ok: false as const, error: message };
      } finally {
        inFlightSync = null;
      }
    })();

    return inFlightSync;
  });

  ipcMain.handle("drive:download-pending-images", async (_event, filenames: string[]) => {
    try {
      await downloadPendingImages(filenames, (status: SyncStatus) =>
        mainWindow?.webContents.send("drive-sync-status", status),
      );
      mainWindow?.webContents.send("notes-changed");
      return { ok: true as const };
    } catch (err) {
      const message = describeSyncError(err);
      mainWindow?.webContents.send("drive-sync-status", { phase: "error", message });
      return { ok: false as const, error: message };
    }
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
