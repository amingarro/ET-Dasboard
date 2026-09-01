import { app } from "electron";
import fs from "node:fs/promises";
import path from "node:path";

let imagesDirPromise: Promise<string> | null = null;

// Se crea de forma diferida, mismo patrón que getNotesDir() en notesStore.ts.
function getImagesCacheDir(): Promise<string> {
  if (!imagesDirPromise) {
    imagesDirPromise = (async () => {
      const dir = path.join(app.getPath("userData"), "notes", "images-cache");
      await fs.mkdir(dir, { recursive: true });
      return dir;
    })();
  }
  return imagesDirPromise;
}

// Los nombres de archivo acá siempre son generados por nosotros mismos
// (`{uuid}.{ext}`) — no llega input sin confiar a esta ruta — pero
// basename() es una protección barata para que un nombre malformado nunca
// escape del directorio de caché.
function safeName(filename: string): string {
  return path.basename(filename);
}

export async function saveImageBytes(filename: string, buffer: Buffer): Promise<void> {
  const dir = await getImagesCacheDir();
  const finalPath = path.join(dir, safeName(filename));
  const tmpPath = `${finalPath}.tmp`;
  await fs.writeFile(tmpPath, buffer);
  await fs.rename(tmpPath, finalPath);
}

export async function getImagePath(filename: string): Promise<string> {
  const dir = await getImagesCacheDir();
  return path.join(dir, safeName(filename));
}

export async function hasImage(filename: string): Promise<boolean> {
  try {
    await fs.access(await getImagePath(filename));
    return true;
  } catch {
    return false;
  }
}

export async function deleteImage(filename: string): Promise<void> {
  await fs.rm(await getImagePath(filename), { force: true });
}

export async function listCachedImages(): Promise<string[]> {
  const dir = await getImagesCacheDir();
  const entries = await fs.readdir(dir);
  return entries.filter((name) => !name.endsWith(".tmp"));
}

const IMAGE_REF_RE = /note-image:\/\/([a-zA-Z0-9._-]+)/g;

// Todas las imágenes a las que apunta actualmente el bodyHtml de una nota —
// la única fuente de verdad de "qué imágenes le pertenecen a esta nota",
// usada tanto para subirlas como para la limpieza de huérfanas. No hace
// falta un campo aparte de adjuntos en Note.
export function extractImageRefs(bodyHtml: string): string[] {
  const refs = new Set<string>();
  for (const match of bodyHtml.matchAll(IMAGE_REF_RE)) {
    refs.add(match[1]);
  }
  return [...refs];
}
