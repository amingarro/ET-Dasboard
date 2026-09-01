import type { Note, NoteChecklistItem, NoteType } from "@/types/electron-api";

interface CreateNoteInput {
  title: string;
  type: NoteType;
  color?: string;
  bodyHtml?: string;
  checklist?: NoteChecklistItem[];
  deadline?: string | null;
}

export function createNote({
  title,
  type,
  color = "default",
  bodyHtml = "",
  checklist = [],
  deadline = null,
}: CreateNoteInput): Note {
  const now = Date.now();
  return {
    id: crypto.randomUUID(),
    title,
    type,
    color,
    pinned: false,
    bodyHtml,
    checklist,
    deadline,
    createdAt: now,
    updatedAt: now,
  };
}

export type DeadlineStatus = "overdue" | "upcoming";

// deadline is a date-only "YYYY-MM-DD" (no time) — treated as due at the end
// of that day, not the start, so a note isn't flagged overdue the whole day
// it's actually due.
export function getDeadlineStatus(deadline: string): DeadlineStatus {
  return new Date(`${deadline}T23:59:59`).getTime() < Date.now() ? "overdue" : "upcoming";
}

export interface DeadlineBreakdown {
  days: number;
  hours: number;
  minutes: number;
}

export function getDeadlineBreakdown(deadline: string): DeadlineBreakdown {
  const diffMs = Math.max(new Date(`${deadline}T23:59:59`).getTime() - Date.now(), 0);
  const totalMinutes = Math.floor(diffMs / (1000 * 60));
  return {
    days: Math.floor(totalMinutes / (60 * 24)),
    hours: Math.floor((totalMinutes % (60 * 24)) / 60),
    minutes: totalMinutes % 60,
  };
}

export interface SplitNoteBody {
  // bodyHtml sin las imágenes — solo el texto/listas, para no volver a
  // renderarlas inline (RichTextEditor.tsx las envuelve en .note-image-wrap).
  textHtml: string;
  // Nombres de archivo (`{uuid}.{ext}`) en el mismo orden en que aparecen en
  // la nota, listos para `note-image://{filename}`.
  imageFilenames: string[];
}

// NoteCard.tsx usa esto para mostrar las imágenes en un carrusel de tamaño
// fijo en vez de dejar que N imágenes de ancho completo apilen la tarjeta a
// una altura enorme. Recorre el DOM en vez de usar una regex porque es un
// parseo de HTML mucho más confiable, aunque acá el HTML sea de confianza.
export function splitNoteBody(bodyHtml: string): SplitNoteBody {
  const container = document.createElement("div");
  container.innerHTML = bodyHtml;
  const imageFilenames: string[] = [];
  container.querySelectorAll(".note-image-wrap").forEach((wrap) => {
    const src = wrap.querySelector("img")?.getAttribute("src") ?? "";
    const match = /^note-image:\/\/(.+)$/.exec(src);
    if (match) imageFilenames.push(match[1]);
    wrap.remove();
  });
  return { textHtml: container.innerHTML, imageFilenames };
}
