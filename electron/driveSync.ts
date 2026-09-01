import { app, shell } from "electron";
import http from "node:http";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { listNotes, saveNote, type Note } from "./notesStore";
import {
  deleteImage as deleteImageLocal,
  extractImageRefs,
  getImagePath,
  listCachedImages,
  saveImageBytes,
} from "./imagesStore";
import { loadSyncState, saveSyncState, type SyncState } from "./syncState";

// This is the real, shipped OAuth client for "ET Dashboard Desktop" (Google
// Cloud project et-dashboard-506210) — safe to commit even in this public
// repo: it's a Desktop-app OAuth client, which RFC 8252 treats as a public
// client (the secret alone grants nothing without a real user completing
// their own Google login), and the consent screen is Internal, restricted
// to @easytech.com.ar accounts. .env.local can still override it for local
// testing with a different client, which is why these are read as a
// fallback rather than inlined at every call site.
const FALLBACK_CLIENT_ID = "602578599745-2a9j6f2439qbdqrpfme2o53ro8nidjeo.apps.googleusercontent.com";
const FALLBACK_CLIENT_SECRET = "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";

// Read lazily (not as a module-level const) — main.ts's require() of this
// module runs before its own .env.local-loading code (TS hoists imports
// above everything else in the compiled output), so capturing these at
// import time could miss a .env.local override.
function getClientId(): string {
  return process.env.GOOGLE_DRIVE_CLIENT_ID ?? FALLBACK_CLIENT_ID;
}
function getClientSecret(): string {
  return process.env.GOOGLE_DRIVE_CLIENT_SECRET ?? FALLBACK_CLIENT_SECRET;
}

// drive.file (not the full "drive" scope): only lets this app see files it
// creates itself, but — unlike appDataFolder — those files are ordinary,
// visible files in the user's own Drive, which is the whole point here.
const SCOPE = "https://www.googleapis.com/auth/drive.file";
const DRIVE_FOLDER_NAME = "ET Dashboard - Notas";
const IMAGES_FOLDER_NAME = "note-imagenes";
const DRIVE_API = "https://www.googleapis.com/drive/v3";
const DRIVE_UPLOAD_API = "https://www.googleapis.com/upload/drive/v3";

interface DriveAuth {
  refreshToken: string;
  folderId: string | null;
  imagesFolderId: string | null;
}

export interface SyncStatus {
  phase: "auth" | "waiting" | "uploading" | "downloading" | "done" | "error";
  message: string;
}

export interface SyncResult {
  uploaded: number;
  downloaded: number;
  conflicts: string[];
  pendingImages: string[];
}

let authFilePromise: Promise<string> | null = null;

function getAuthFilePath(): Promise<string> {
  if (!authFilePromise) {
    authFilePromise = (async () => {
      const dir = app.getPath("userData");
      await fs.mkdir(dir, { recursive: true });
      return path.join(dir, "drive-auth.json");
    })();
  }
  return authFilePromise;
}

async function loadAuth(): Promise<DriveAuth | null> {
  try {
    const raw = await fs.readFile(await getAuthFilePath(), "utf-8");
    const parsed = JSON.parse(raw) as Partial<DriveAuth> & { refreshToken: string };
    return {
      refreshToken: parsed.refreshToken,
      folderId: parsed.folderId ?? null,
      imagesFolderId: parsed.imagesFolderId ?? null,
    };
  } catch {
    return null;
  }
}

async function saveAuth(auth: DriveAuth): Promise<void> {
  await fs.writeFile(await getAuthFilePath(), JSON.stringify(auth, null, 2), "utf-8");
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
}

async function requestToken(params: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Google rechazó el pedido de token (${res.status}): ${body.slice(0, 200)}`);
  }
  return (await res.json()) as TokenResponse;
}

// Google actively blocks OAuth logins from an embedded webview
// ("disallowed_useragent"), so this opens the user's real system browser and
// waits on a one-shot local HTTP server for the redirect — the standard
// "loopback" flow for installed/desktop apps (RFC 8252).
function runOAuthFlow(onStatus: (s: SyncStatus) => void): Promise<{ code: string; redirectUri: string }> {
  return new Promise((resolve, reject) => {
    const stateToken = crypto.randomBytes(16).toString("hex");
    let redirectUri = "";

    const server = http.createServer((req, res) => {
      const url = new URL(req.url ?? "/", redirectUri || "http://127.0.0.1");
      const code = url.searchParams.get("code");
      const returnedState = url.searchParams.get("state");
      const error = url.searchParams.get("error");

      res.setHeader("Content-Type", "text/html; charset=utf-8");
      if (error || !code || returnedState !== stateToken) {
        res.end(
          '<html><body style="font-family:sans-serif;text-align:center;padding-top:4rem"><h3>Algo salió mal. Podés cerrar esta pestaña y volver a intentar desde ET Dashboard.</h3></body></html>',
        );
        server.close();
        reject(new Error(error ?? "Respuesta de Google inválida"));
        return;
      }

      res.end(
        '<html><body style="font-family:sans-serif;text-align:center;padding-top:4rem"><h3>Listo, ya podés volver a ET Dashboard.</h3></body></html>',
      );
      server.close();
      resolve({ code, redirectUri });
    });

    server.on("error", reject);

    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      redirectUri = `http://127.0.0.1:${port}`;

      const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
      authUrl.searchParams.set("client_id", getClientId());
      authUrl.searchParams.set("redirect_uri", redirectUri);
      authUrl.searchParams.set("response_type", "code");
      authUrl.searchParams.set("scope", SCOPE);
      authUrl.searchParams.set("access_type", "offline");
      // Forces Google to reissue a refresh_token every time, since we only
      // hit this interactive path when we don't already have one saved.
      authUrl.searchParams.set("prompt", "consent");
      authUrl.searchParams.set("state", stateToken);

      onStatus({ phase: "auth", message: "Abriendo el navegador para autorizar…" });
      shell.openExternal(authUrl.toString());
      onStatus({ phase: "waiting", message: "Esperando autorización en el navegador…" });
    });
  });
}

async function getAccessToken(onStatus: (s: SyncStatus) => void): Promise<{ accessToken: string; auth: DriveAuth }> {
  const stored = await loadAuth();
  if (stored?.refreshToken) {
    try {
      const tokens = await requestToken({
        refresh_token: stored.refreshToken,
        client_id: getClientId(),
        client_secret: getClientSecret(),
        grant_type: "refresh_token",
      });
      return { accessToken: tokens.access_token, auth: stored };
    } catch {
      // Refresh token expired/revoked (e.g. access removed in Google account
      // settings) — fall through to a fresh interactive login below.
    }
  }

  const { code, redirectUri } = await runOAuthFlow(onStatus);
  const tokens = await requestToken({
    code,
    client_id: getClientId(),
    client_secret: getClientSecret(),
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
  });
  if (!tokens.refresh_token) {
    throw new Error(
      "Google no devolvió un refresh token. Revocá el acceso de ET Dashboard en myaccount.google.com/permissions y volvé a intentar.",
    );
  }
  const auth: DriveAuth = {
    refreshToken: tokens.refresh_token,
    folderId: stored?.folderId ?? null,
    imagesFolderId: stored?.imagesFolderId ?? null,
  };
  await saveAuth(auth);
  return { accessToken: tokens.access_token, auth };
}

async function driveFetch(accessToken: string, url: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(url, {
    ...init,
    headers: { ...(init?.headers ?? {}), Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Drive API respondió ${res.status}: ${body.slice(0, 200)}`);
  }
  return res;
}

async function createDriveFileGeneric(
  accessToken: string,
  folderId: string,
  name: string,
  mimeType: string,
  content: Buffer | string,
): Promise<{ id: string; modifiedTime: string }> {
  const boundary = "et_dashboard_notes_boundary";
  const metadata = { name, parents: [folderId] };
  const head = Buffer.from(
    `--${boundary}\r\n` +
      `Content-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n` +
      `--${boundary}\r\n` +
      `Content-Type: ${mimeType}\r\n\r\n`,
  );
  const bodyBuf = typeof content === "string" ? Buffer.from(content, "utf-8") : content;
  const tail = Buffer.from(`\r\n--${boundary}--`);
  const fullBody = Buffer.concat([head, bodyBuf, tail]);

  const res = await driveFetch(accessToken, `${DRIVE_UPLOAD_API}/files?uploadType=multipart&fields=id,modifiedTime`, {
    method: "POST",
    headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
    body: fullBody,
  });
  return (await res.json()) as { id: string; modifiedTime: string };
}

async function patchDriveFile(
  accessToken: string,
  fileId: string,
  mimeType: string,
  content: Buffer | string,
): Promise<{ modifiedTime: string }> {
  const res = await driveFetch(accessToken, `${DRIVE_UPLOAD_API}/files/${fileId}?uploadType=media&fields=modifiedTime`, {
    method: "PATCH",
    headers: { "Content-Type": mimeType },
    body: content as BodyInit,
  });
  return (await res.json()) as { modifiedTime: string };
}

async function renameDriveFile(accessToken: string, fileId: string, newName: string): Promise<void> {
  await driveFetch(accessToken, `${DRIVE_API}/files/${fileId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: newName }),
  });
}

async function downloadDriveFile(accessToken: string, fileId: string): Promise<Buffer> {
  const res = await driveFetch(accessToken, `${DRIVE_API}/files/${fileId}?alt=media`);
  return Buffer.from(await res.arrayBuffer());
}

async function deleteDriveFile(accessToken: string, fileId: string): Promise<void> {
  await driveFetch(accessToken, `${DRIVE_API}/files/${fileId}`, { method: "DELETE" });
}

async function ensureReadme(accessToken: string, folderId: string): Promise<void> {
  const q = encodeURIComponent(`'${folderId}' in parents and name = '${README_NAME}' and trashed = false`);
  const res = await driveFetch(accessToken, `${DRIVE_API}/files?q=${q}&fields=files(id)`);
  const data = (await res.json()) as { files: { id: string }[] };
  if (data.files.length > 0) return;
  await createDriveFileGeneric(accessToken, folderId, README_NAME, "text/plain", README_CONTENT);
}

async function ensureFolder(accessToken: string, auth: DriveAuth): Promise<string> {
  if (auth.folderId) {
    const check = await fetch(`${DRIVE_API}/files/${auth.folderId}?fields=id,trashed`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (check.ok) {
      const data = (await check.json()) as { id: string; trashed?: boolean };
      if (!data.trashed) {
        await ensureReadme(accessToken, data.id);
        return data.id;
      }
    }
  }

  const q = encodeURIComponent(
    `name = '${DRIVE_FOLDER_NAME}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
  );
  const listRes = await driveFetch(accessToken, `${DRIVE_API}/files?q=${q}&fields=files(id,name)`);
  const listData = (await listRes.json()) as { files: { id: string; name: string }[] };
  if (listData.files.length > 0) {
    await ensureReadme(accessToken, listData.files[0].id);
    return listData.files[0].id;
  }

  const createRes = await driveFetch(accessToken, `${DRIVE_API}/files`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: DRIVE_FOLDER_NAME, mimeType: "application/vnd.google-apps.folder" }),
  });
  const created = (await createRes.json()) as { id: string };

  await ensureReadme(accessToken, created.id);
  return created.id;
}

async function ensureImagesSubfolder(accessToken: string, notesFolderId: string, auth: DriveAuth): Promise<string> {
  if (auth.imagesFolderId) {
    const check = await fetch(`${DRIVE_API}/files/${auth.imagesFolderId}?fields=id,trashed`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (check.ok) {
      const data = (await check.json()) as { id: string; trashed?: boolean };
      if (!data.trashed) return data.id;
    }
  }

  const q = encodeURIComponent(
    `'${notesFolderId}' in parents and name = '${IMAGES_FOLDER_NAME}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
  );
  const listRes = await driveFetch(accessToken, `${DRIVE_API}/files?q=${q}&fields=files(id,name)`);
  const listData = (await listRes.json()) as { files: { id: string; name: string }[] };
  if (listData.files.length > 0) return listData.files[0].id;

  const createRes = await driveFetch(accessToken, `${DRIVE_API}/files`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: IMAGES_FOLDER_NAME,
      mimeType: "application/vnd.google-apps.folder",
      parents: [notesFolderId],
    }),
  });
  const created = (await createRes.json()) as { id: string };
  return created.id;
}

async function listFolderFiles(
  accessToken: string,
  folderId: string,
): Promise<Map<string, { id: string; modifiedTime: string }>> {
  const q = encodeURIComponent(`'${folderId}' in parents and trashed = false`);
  const res = await driveFetch(accessToken, `${DRIVE_API}/files?q=${q}&fields=files(id,name,modifiedTime)&pageSize=1000`);
  const data = (await res.json()) as { files: { id: string; name: string; modifiedTime: string }[] };
  return new Map(data.files.map((f) => [f.name, { id: f.id, modifiedTime: f.modifiedTime }]));
}

const README_NAME = "ANTES DE BORRAR REEDME.txt";
const README_CONTENT = `Esta carpeta la usa ET Dashboard para sincronizar tus Notas.

Cada archivo .json que ves acá es una nota de la app (una nota = un archivo).
Las imágenes de las notas viven en la subcarpeta "${IMAGES_FOLDER_NAME}".
No los edites ni los borres a mano: se sobrescriben en la próxima sincronización
y cualquier cambio hecho directamente en Drive puede perderse si en el mismo
momento hay un cambio en conflicto hecho desde la app.

Si borrás esta carpeta entera, ET Dashboard crea una nueva la próxima vez que
sincronices — no pasa nada grave, pero perdés este historial en Drive.
`;

async function uploadNote(accessToken: string, folderId: string, note: Note, existingId?: string): Promise<{ modifiedTime: string }> {
  const content = JSON.stringify(note, null, 2);
  if (existingId) {
    return patchDriveFile(accessToken, existingId, "application/json", content);
  }
  return createDriveFileGeneric(accessToken, folderId, `${note.id}.json`, "application/json", content);
}

async function saveConflictBackup(note: Note): Promise<void> {
  const dir = path.join(app.getPath("userData"), "notes", "conflicts");
  await fs.mkdir(dir, { recursive: true });
  const iso = new Date().toISOString().replace(/[:.]/g, "-");
  await fs.writeFile(path.join(dir, `${note.id}-${iso}.json`), JSON.stringify(note, null, 2), "utf-8");
}

function slugify(text: string): string {
  const slug = text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return slug || "nota";
}

function mimeFromExt(filename: string): string {
  switch (path.extname(filename).slice(1).toLowerCase()) {
    case "png":
      return "image/png";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "gif":
      return "image/gif";
    case "webp":
      return "image/webp";
    case "svg":
      return "image/svg+xml";
    default:
      return "application/octet-stream";
  }
}

// Resuelve el estado local vs. remoto de cada nota (y, después, de cada
// imagen que cualquier nota referencia) contra sync-state.json, y concilia
// ambas direcciones: el lado más nuevo gana directamente, y una edición
// doble genuina (cambió en ambos lados desde el último sync) se resuelve
// con "gana el más reciente" guardando la copia perdedora en
// notes/conflicts/ para que nada se pierda en silencio.
export async function syncNotes(onStatus: (s: SyncStatus) => void): Promise<SyncResult> {
  const { accessToken, auth } = await getAccessToken(onStatus);

  onStatus({ phase: "uploading", message: "Preparando la carpeta en Drive…" });
  const notesFolderId = await ensureFolder(accessToken, auth);
  let currentAuth = auth;
  if (currentAuth.folderId !== notesFolderId) currentAuth = { ...currentAuth, folderId: notesFolderId };
  const imagesFolderId = await ensureImagesSubfolder(accessToken, notesFolderId, currentAuth);
  if (currentAuth.imagesFolderId !== imagesFolderId) currentAuth = { ...currentAuth, imagesFolderId };
  if (currentAuth !== auth) await saveAuth(currentAuth);

  const [localNotes, remoteNoteFiles, remoteImageFiles, syncState] = await Promise.all([
    listNotes(),
    listFolderFiles(accessToken, notesFolderId),
    listFolderFiles(accessToken, imagesFolderId),
    loadSyncState(),
  ]);

  // 1) Primero los tombstones, para que una nota borrada localmente no
  // termine tratada como "solo existe en remoto -> bajarla de nuevo" por el
  // loop principal de abajo.
  const stillDeleted: string[] = [];
  for (const noteId of syncState.deletedNoteIds) {
    try {
      const remoteFile = remoteNoteFiles.get(`${noteId}.json`);
      if (remoteFile) {
        await deleteDriveFile(accessToken, remoteFile.id);
        remoteNoteFiles.delete(`${noteId}.json`);
      }
      delete syncState.notes[noteId];
    } catch {
      stillDeleted.push(noteId);
    }
  }
  syncState.deletedNoteIds = stillDeleted;
  const pendingDeleteIds = new Set(stillDeleted);

  // 2) Concilia cada nota que exista localmente, remotamente, o en ambos lados.
  const localById = new Map(localNotes.map((n) => [n.id, n]));
  const finalNotesById = new Map(localById);
  const remoteNoteIds = new Set<string>();
  for (const name of remoteNoteFiles.keys()) {
    if (name.endsWith(".json")) remoteNoteIds.add(name.slice(0, -".json".length));
  }
  const allNoteIds = new Set([...localById.keys(), ...remoteNoteIds].filter((id) => !pendingDeleteIds.has(id)));

  let uploaded = 0;
  let downloaded = 0;
  const conflicts: string[] = [];

  onStatus({ phase: "uploading", message: `Sincronizando ${allNoteIds.size} ${allNoteIds.size === 1 ? "nota" : "notas"}…` });

  for (const noteId of allNoteIds) {
    const local = localById.get(noteId);
    const remoteEntry = remoteNoteFiles.get(`${noteId}.json`);
    const stateEntry = syncState.notes[noteId];

    if (local && remoteEntry && !stateEntry) {
      // Todavía no hay línea base para esta nota — lo más común es que ya
      // estuviera sincronizada con Drive bajo la versión anterior de solo-
      // subida, de antes de que existiera sync-state.json. Sin estado previo,
      // cualquier nota ya sincronizada se vería como "cambió en ambos lados"
      // y quedaría marcada como conflicto solo por faltar la línea base, no
      // por una edición doble real — así que acá gana directo el lado más
      // nuevo, sin backup.
      const remoteNote = JSON.parse((await downloadDriveFile(accessToken, remoteEntry.id)).toString("utf-8")) as Note;
      if (local.updatedAt > remoteNote.updatedAt) {
        const result = await uploadNote(accessToken, notesFolderId, local, remoteEntry.id);
        syncState.notes[noteId] = { localUpdatedAt: local.updatedAt, remoteModifiedTime: result.modifiedTime };
        uploaded++;
      } else if (local.updatedAt < remoteNote.updatedAt) {
        await saveNote(remoteNote);
        syncState.notes[noteId] = { localUpdatedAt: remoteNote.updatedAt, remoteModifiedTime: remoteEntry.modifiedTime };
        downloaded++;
        finalNotesById.set(noteId, remoteNote);
      } else {
        syncState.notes[noteId] = { localUpdatedAt: local.updatedAt, remoteModifiedTime: remoteEntry.modifiedTime };
      }
      continue;
    }

    const localChanged = !!local && !!stateEntry && local.updatedAt > stateEntry.localUpdatedAt;
    const remoteChanged = !!remoteEntry && !!stateEntry && remoteEntry.modifiedTime !== stateEntry.remoteModifiedTime;

    if (local && remoteEntry && localChanged && remoteChanged) {
      const remoteNote = JSON.parse((await downloadDriveFile(accessToken, remoteEntry.id)).toString("utf-8")) as Note;
      const localWins = local.updatedAt >= remoteNote.updatedAt;
      await saveConflictBackup(localWins ? remoteNote : local);
      conflicts.push(local.title || noteId);
      if (localWins) {
        const result = await uploadNote(accessToken, notesFolderId, local, remoteEntry.id);
        syncState.notes[noteId] = { localUpdatedAt: local.updatedAt, remoteModifiedTime: result.modifiedTime };
        uploaded++;
      } else {
        await saveNote(remoteNote);
        syncState.notes[noteId] = { localUpdatedAt: remoteNote.updatedAt, remoteModifiedTime: remoteEntry.modifiedTime };
        downloaded++;
        finalNotesById.set(noteId, remoteNote);
      }
    } else if (local && remoteEntry && localChanged) {
      const result = await uploadNote(accessToken, notesFolderId, local, remoteEntry.id);
      syncState.notes[noteId] = { localUpdatedAt: local.updatedAt, remoteModifiedTime: result.modifiedTime };
      uploaded++;
    } else if (local && remoteEntry && remoteChanged) {
      const remoteNote = JSON.parse((await downloadDriveFile(accessToken, remoteEntry.id)).toString("utf-8")) as Note;
      await saveNote(remoteNote);
      syncState.notes[noteId] = { localUpdatedAt: remoteNote.updatedAt, remoteModifiedTime: remoteEntry.modifiedTime };
      downloaded++;
      finalNotesById.set(noteId, remoteNote);
    } else if (local && !remoteEntry) {
      const result = await uploadNote(accessToken, notesFolderId, local);
      syncState.notes[noteId] = { localUpdatedAt: local.updatedAt, remoteModifiedTime: result.modifiedTime };
      uploaded++;
    } else if (!local && remoteEntry) {
      const remoteNote = JSON.parse((await downloadDriveFile(accessToken, remoteEntry.id)).toString("utf-8")) as Note;
      await saveNote(remoteNote);
      syncState.notes[noteId] = { localUpdatedAt: remoteNote.updatedAt, remoteModifiedTime: remoteEntry.modifiedTime };
      downloaded++;
      finalNotesById.set(noteId, remoteNote);
    }
  }

  // 3) Imágenes: indexadas por el título/id *actual* de la nota, para que el
  // nombre en Drive siga siendo legible aunque se renombre la nota (un
  // renombrado de metadata barato, no una re-subida — ver la comparación de
  // `driveName` más abajo).
  onStatus({ phase: "uploading", message: "Sincronizando imágenes…" });

  const imageOwners = new Map<string, { noteId: string; title: string }>();
  for (const note of finalNotesById.values()) {
    for (const filename of extractImageRefs(note.bodyHtml)) {
      imageOwners.set(filename, { noteId: note.id, title: note.title });
    }
  }

  // Imágenes que ya ninguna nota referencia (se borró la nota, o se sacó la
  // imagen de su cuerpo) — se eliminan tanto de Drive como de la caché local.
  for (const filename of Object.keys(syncState.images)) {
    if (!imageOwners.has(filename)) {
      const entry = syncState.images[filename];
      const remote = remoteImageFiles.get(entry.driveName);
      if (remote) {
        try {
          await deleteDriveFile(accessToken, remote.id);
        } catch {
          // Mejor esfuerzo — que quede una huérfana en Drive no es tan grave
          // como hacer fallar todo el sync por una limpieza que no era crítica.
        }
      }
      await deleteImageLocal(filename);
      delete syncState.images[filename];
    }
  }
  // Deliberadamente NO se barre la caché local buscando archivos "sueltos"
  // (ni en imageOwners ni en syncState.images) para borrarlos: eso causaba
  // pérdida real de imágenes recién insertadas — el archivo ya está en la
  // caché en cuanto el editor llama a notes:save-image, pero la nota (con la
  // referencia en su bodyHtml) recién se guarda en disco unos segundos
  // después, por el debounce de autosave. Un sync que corre justo en esa
  // ventana veía la imagen como huérfana y la borraba antes de que la nota
  // llegara a referenciarla. La limpieza de arriba (imágenes que SÍ estaban
  // trackeadas en syncState.images y dejaron de estar referenciadas) alcanza
  // para el caso real de "se sacó una imagen de una nota".
  const cachedImages = new Set(await listCachedImages());

  const pendingImages: string[] = [];
  for (const [filename, owner] of imageOwners) {
    const desiredDriveName = `${slugify(owner.title)}__${owner.noteId}__${filename}`;
    const stateEntry = syncState.images[filename];
    const remoteEntry = stateEntry ? remoteImageFiles.get(stateEntry.driveName) : remoteImageFiles.get(desiredDriveName);

    if (!remoteEntry) {
      if (cachedImages.has(filename)) {
        const buffer = await fs.readFile(await getImagePath(filename));
        const created = await createDriveFileGeneric(accessToken, imagesFolderId, desiredDriveName, mimeFromExt(filename), buffer);
        syncState.images[filename] = { remoteModifiedTime: created.modifiedTime, driveName: desiredDriveName };
      }
      // Referenciada en bodyHtml pero falta tanto local como en Drive: una
      // referencia colgada (p. ej. la app se cerró justo después de
      // insertarla, antes del primer sync) — no hay nada que sincronizar,
      // se deja así.
      continue;
    }

    if (stateEntry && stateEntry.driveName !== desiredDriveName) {
      await renameDriveFile(accessToken, remoteEntry.id, desiredDriveName);
    }
    if (!cachedImages.has(filename)) pendingImages.push(filename);
    syncState.images[filename] = { remoteModifiedTime: remoteEntry.modifiedTime, driveName: desiredDriveName };
  }

  await saveSyncState(syncState satisfies SyncState);

  onStatus({
    phase: "done",
    message: `Listo — ${uploaded} ${uploaded === 1 ? "subida" : "subidas"}, ${downloaded} ${downloaded === 1 ? "bajada" : "bajadas"}${conflicts.length ? `, ${conflicts.length} en conflicto` : ""}.`,
  });

  return { uploaded, downloaded, conflicts, pendingImages };
}

export async function downloadPendingImages(filenames: string[], onStatus: (s: SyncStatus) => void): Promise<{ downloaded: number }> {
  const { accessToken, auth } = await getAccessToken(onStatus);
  if (!auth.folderId) throw new Error("Todavía no hay una carpeta de Drive sincronizada.");
  const imagesFolderId = await ensureImagesSubfolder(accessToken, auth.folderId, auth);

  const [syncState, remoteImageFiles] = await Promise.all([loadSyncState(), listFolderFiles(accessToken, imagesFolderId)]);

  onStatus({
    phase: "downloading",
    message: `Descargando ${filenames.length} ${filenames.length === 1 ? "imagen" : "imágenes"}…`,
  });

  let downloaded = 0;
  for (const filename of filenames) {
    const entry = syncState.images[filename];
    const remote = entry ? remoteImageFiles.get(entry.driveName) : undefined;
    if (!remote) continue;
    const buffer = await downloadDriveFile(accessToken, remote.id);
    await saveImageBytes(filename, buffer);
    downloaded++;
  }

  onStatus({
    phase: "done",
    message: `Listo — ${downloaded} ${downloaded === 1 ? "imagen descargada" : "imágenes descargadas"}.`,
  });
  return { downloaded };
}
