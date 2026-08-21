import { app, shell } from "electron";
import http from "node:http";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { listNotes, type Note } from "./notesStore";

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
const DRIVE_API = "https://www.googleapis.com/drive/v3";
const DRIVE_UPLOAD_API = "https://www.googleapis.com/upload/drive/v3";

interface DriveAuth {
  refreshToken: string;
  folderId: string | null;
}

export interface SyncStatus {
  phase: "auth" | "waiting" | "uploading" | "done" | "error";
  message: string;
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
    return JSON.parse(raw) as DriveAuth;
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
  const auth: DriveAuth = { refreshToken: tokens.refresh_token, folderId: stored?.folderId ?? null };
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

async function ensureReadme(accessToken: string, folderId: string): Promise<void> {
  const q = encodeURIComponent(`'${folderId}' in parents and name = '${README_NAME}' and trashed = false`);
  const res = await driveFetch(accessToken, `${DRIVE_API}/files?q=${q}&fields=files(id)`);
  const data = (await res.json()) as { files: { id: string }[] };
  if (data.files.length > 0) return;
  await createDriveFile(accessToken, folderId, README_NAME, "text/plain", README_CONTENT);
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

async function listFolderFiles(accessToken: string, folderId: string): Promise<Map<string, string>> {
  const q = encodeURIComponent(`'${folderId}' in parents and trashed = false`);
  const res = await driveFetch(accessToken, `${DRIVE_API}/files?q=${q}&fields=files(id,name)&pageSize=1000`);
  const data = (await res.json()) as { files: { id: string; name: string }[] };
  return new Map(data.files.map((f) => [f.name, f.id]));
}

async function createDriveFile(
  accessToken: string,
  folderId: string,
  name: string,
  mimeType: string,
  content: string,
): Promise<void> {
  const boundary = "et_dashboard_notes_boundary";
  const metadata = { name, parents: [folderId] };
  const body =
    `--${boundary}\r\n` +
    `Content-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\n` +
    `Content-Type: ${mimeType}; charset=UTF-8\r\n\r\n${content}\r\n` +
    `--${boundary}--`;

  await driveFetch(accessToken, `${DRIVE_UPLOAD_API}/files?uploadType=multipart`, {
    method: "POST",
    headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
    body,
  });
}

const README_NAME = "ANTES DE BORRAR REEDME.txt";
const README_CONTENT = `Esta carpeta la usa ET Dashboard para sincronizar tus Notas.

Cada archivo .json que ves acá es una nota de la app (una nota = un archivo).
No los edites ni los borres a mano: se sobrescriben en la próxima sincronización
y cualquier cambio hecho directamente en Drive no se refleja en la app.

Si borrás esta carpeta entera, ET Dashboard crea una nueva la próxima vez que
sincronices — no pasa nada grave, pero perdés este historial en Drive.
`;

async function uploadNote(accessToken: string, folderId: string, note: Note, existingId?: string): Promise<void> {
  const content = JSON.stringify(note, null, 2);

  if (existingId) {
    await driveFetch(accessToken, `${DRIVE_UPLOAD_API}/files/${existingId}?uploadType=media`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: content,
    });
    return;
  }

  await createDriveFile(accessToken, folderId, `${note.id}.json`, "application/json", content);
}

// v1: one-way push (app -> Drive). Good enough to make notes visible/backed
// up in Drive as asked; pulling changes made by hand in Drive back down is
// deliberately left out until the one-way version proves worth keeping.
export async function syncNotesToDrive(onStatus: (s: SyncStatus) => void): Promise<{ uploaded: number }> {
  const { accessToken, auth } = await getAccessToken(onStatus);

  onStatus({ phase: "uploading", message: "Preparando la carpeta en Drive…" });
  const folderId = await ensureFolder(accessToken, auth);
  if (auth.folderId !== folderId) {
    await saveAuth({ ...auth, folderId });
  }

  const [notes, existingFiles] = await Promise.all([listNotes(), listFolderFiles(accessToken, folderId)]);

  onStatus({
    phase: "uploading",
    message: `Subiendo ${notes.length} ${notes.length === 1 ? "nota" : "notas"}…`,
  });
  for (const note of notes) {
    await uploadNote(accessToken, folderId, note, existingFiles.get(`${note.id}.json`));
  }

  onStatus({
    phase: "done",
    message: `Listo — ${notes.length} ${notes.length === 1 ? "nota sincronizada" : "notas sincronizadas"}.`,
  });
  return { uploaded: notes.length };
}
