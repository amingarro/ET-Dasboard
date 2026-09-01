import { app } from "electron";
import fs from "node:fs/promises";
import path from "node:path";

export interface NoteSyncEntry {
  localUpdatedAt: number;
  remoteModifiedTime: string | null;
}

export interface ImageSyncEntry {
  remoteModifiedTime: string | null;
  // El nombre de archivo en Drive bajo el que está guardada esta imagen
  // ahora mismo (incluye el título/id de la nota dueña — ver el slugify de
  // driveSync.ts) — se rastrea aparte del nombre de archivo local para que
  // renombrar una nota dispare un renombrado barato del lado de Drive en vez
  // de volver a subir los bytes de la imagen.
  driveName: string;
}

export interface SyncState {
  notes: Record<string, NoteSyncEntry>;
  images: Record<string, ImageSyncEntry>;
  // Notas borradas localmente cuya copia en Drive (y sus imágenes) todavía
  // falta borrar — se limpia una vez que ese borrado remoto tiene éxito. Sin
  // esto, una nota borrada localmente se vería idéntica a "todavía nunca
  // sincronizada" en el próximo pull y resucitaría desde Drive.
  deletedNoteIds: string[];
}

function emptyState(): SyncState {
  return { notes: {}, images: {}, deletedNoteIds: [] };
}

let statePathPromise: Promise<string> | null = null;

function getSyncStatePath(): Promise<string> {
  if (!statePathPromise) {
    // Deliberadamente NO dentro de userData/notes/ — notesStore.listNotes()
    // trata cada *.json de ese directorio como una Note (causó un crash real
    // durante las pruebas: este archivo se leyó como una nota sin id/bodyHtml).
    statePathPromise = (async () => {
      const dir = app.getPath("userData");
      await fs.mkdir(dir, { recursive: true });
      return path.join(dir, "sync-state.json");
    })();
  }
  return statePathPromise;
}

export async function loadSyncState(): Promise<SyncState> {
  try {
    const raw = await fs.readFile(await getSyncStatePath(), "utf-8");
    const parsed = JSON.parse(raw) as Partial<SyncState>;
    return {
      notes: parsed.notes ?? {},
      images: parsed.images ?? {},
      deletedNoteIds: parsed.deletedNoteIds ?? [],
    };
  } catch {
    return emptyState();
  }
}

export async function saveSyncState(state: SyncState): Promise<void> {
  const finalPath = await getSyncStatePath();
  const tmpPath = `${finalPath}.tmp`;
  await fs.writeFile(tmpPath, JSON.stringify(state, null, 2), "utf-8");
  await fs.rename(tmpPath, finalPath);
}

export async function markNoteDeleted(noteId: string): Promise<void> {
  const state = await loadSyncState();
  if (!state.deletedNoteIds.includes(noteId)) {
    state.deletedNoteIds.push(noteId);
  }
  delete state.notes[noteId];
  await saveSyncState(state);
}
