import { app } from "electron";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

export type NoteType = "normal" | "todo";

export interface NoteChecklistItem {
  id: string;
  text: string;
  done: boolean;
}

export interface Note {
  id: string;
  title: string;
  type: NoteType;
  color: string;
  pinned: boolean;
  bodyHtml: string;
  checklist: NoteChecklistItem[];
  deadline: string | null;
  createdAt: number;
  updatedAt: number;
}

let notesDirPromise: Promise<string> | null = null;

function daysFromNowISODate(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Shown once, only on a genuinely fresh install (see the fs.mkdir return
// check below) — three notes, each combining a few features rather than one
// feature per note, so a first-time user sees most of what Notas can do
// without wading through a pile of throwaway examples.
function createDefaultNotes(): Note[] {
  const now = Date.now();
  return [
    {
      id: randomUUID(),
      title: "Bienvenido a Notas",
      type: "normal",
      color: "default",
      pinned: true,
      bodyHtml:
        "<p>Total libertad para organizar lo que se te ocurra. Escribí notas con <b>negrita</b>, <i>itálica</i> y listas, o armá checklists tipo TODO.</p>",
      checklist: [],
      deadline: null,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: randomUUID(),
      title: "Probá estas acciones",
      type: "todo",
      color: "sky",
      pinned: false,
      bodyHtml: "",
      checklist: [
        { id: randomUUID(), text: "Tildá este ítem", done: false },
        { id: randomUUID(), text: "Cambiale el color a esta nota", done: false },
        { id: randomUUID(), text: "Fijala arriba con el ícono de pin", done: false },
      ],
      deadline: daysFromNowISODate(3),
      createdAt: now,
      updatedAt: now,
    },
    {
      id: randomUUID(),
      title: "Así se ve una fecha vencida",
      type: "normal",
      color: "violet",
      pinned: false,
      bodyHtml: "<p>Si una nota se pasa de fecha, el aviso cambia a <b>rojo</b> para que no se te escape.</p>",
      checklist: [],
      deadline: daysFromNowISODate(-1),
      createdAt: now,
      updatedAt: now,
    },
  ];
}

async function writeNoteFile(dir: string, note: Note): Promise<void> {
  const finalPath = path.join(dir, `${note.id}.json`);
  const tmpPath = `${finalPath}.tmp`;
  // Write-then-rename: rename is atomic on the same filesystem, so a crash
  // mid-write leaves the previous version of this one note intact instead of
  // a half-written file.
  await fs.writeFile(tmpPath, JSON.stringify(note, null, 2), "utf-8");
  await fs.rename(tmpPath, finalPath);
}

// Lazily created, same pattern as electron-store's own lazy singleton in
// store.ts — the userData dir isn't guaranteed to exist yet at module load.
function getNotesDir(): Promise<string> {
  if (!notesDirPromise) {
    notesDirPromise = (async () => {
      const dir = path.join(app.getPath("userData"), "notes");
      // fs.mkdir(..., {recursive:true}) resolves to the path it had to
      // create, or undefined if the directory already existed — a reliable,
      // one-time "this is a fresh install" signal. A user who deletes every
      // note later still has the (now-empty) directory, so it won't reseed.
      const created = await fs.mkdir(dir, { recursive: true });
      if (created) {
        for (const note of createDefaultNotes()) {
          await writeNoteFile(dir, note);
        }
      }
      return dir;
    })();
  }
  return notesDirPromise;
}

export async function listNotes(): Promise<Note[]> {
  const dir = await getNotesDir();
  const entries = await fs.readdir(dir);
  const notes: Note[] = [];
  for (const entry of entries) {
    if (!entry.endsWith(".json")) continue;
    try {
      const raw = await fs.readFile(path.join(dir, entry), "utf-8");
      notes.push(JSON.parse(raw) as Note);
    } catch (err) {
      // One corrupted note file must not take the whole list down with it —
      // the entire point of one-file-per-note over a single combined blob.
      console.error(`[notesStore] skipping unreadable note file ${entry}:`, err);
    }
  }
  return notes;
}

export async function saveNote(note: Note): Promise<void> {
  const dir = await getNotesDir();
  await writeNoteFile(dir, note);
}

export async function deleteNote(id: string): Promise<void> {
  const dir = await getNotesDir();
  await fs.rm(path.join(dir, `${id}.json`), { force: true });
}
