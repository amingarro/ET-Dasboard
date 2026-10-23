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

// URLs sueltas en texto plano: http(s):// o www. seguido de cualquier cosa
// sin espacios — mismo criterio simple que usan Gmail/WhatsApp para
// autodetectar links, sin pretender ser un parser RFC 3986 completo.
const URL_PATTERN = /(https?:\/\/[^\s<]+|www\.[^\s<]+)/gi;

// Puntuación de cierre casi siempre parte de la oración, no de la URL —
// "mirá esto: https://x.com/foo." o "(https://x.com/foo)" no deberían
// arrastrar el "." o el ")" adentro del link.
function trimTrailingPunctuation(url: string): string {
  return url.replace(/[.,;:!?)\]}'"]+$/, "");
}

function toHref(url: string): string {
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}

// Reparte un string de texto plano en nodos reales (texto + <br> por cada
// salto de línea) en vez de con innerHTML, para no tener que reimplementar
// el escapado de HTML que el DOM ya hace solo al crear un text node.
function appendTextWithLineBreaks(parent: Node, text: string): void {
  const lines = text.split("\n");
  lines.forEach((line, i) => {
    if (line) parent.appendChild(document.createTextNode(line));
    if (i < lines.length - 1) parent.appendChild(document.createElement("br"));
  });
}

// Envuelve las URLs sueltas de un string de texto plano en <a> reales, listo
// para insertar en un contenteditable (RichTextEditor.tsx la usa al pegar).
export function buildLinkifiedFragment(text: string): DocumentFragment {
  const fragment = document.createDocumentFragment();
  URL_PATTERN.lastIndex = 0;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = URL_PATTERN.exec(text))) {
    appendTextWithLineBreaks(fragment, text.slice(lastIndex, match.index));
    const url = trimTrailingPunctuation(match[0]);
    const a = document.createElement("a");
    a.href = toHref(url);
    a.title = "Ctrl+clic para abrir el enlace";
    a.textContent = url;
    fragment.appendChild(a);
    lastIndex = match.index + url.length;
  }
  appendTextWithLineBreaks(fragment, text.slice(lastIndex));
  return fragment;
}

function linkifyNode(node: Node): void {
  for (const child of Array.from(node.childNodes)) {
    if (child.nodeType === Node.TEXT_NODE) {
      const text = child.textContent ?? "";
      URL_PATTERN.lastIndex = 0;
      if (URL_PATTERN.test(text)) {
        child.replaceWith(buildLinkifiedFragment(text));
      }
    } else if (child.nodeType === Node.ELEMENT_NODE) {
      const el = child as Element;
      // No relinkificar dentro de un <a> ya armado, ni meterse en el bloque
      // no editable de una imagen (RichTextEditor.tsx's .note-image-wrap).
      if (el.tagName !== "A" && !el.classList.contains("note-image-wrap")) {
        linkifyNode(el);
      }
    }
  }
}

// Igual que buildLinkifiedFragment pero sobre un string de bodyHtml ya
// guardado (en vez de construir directo sobre un contenteditable en vivo) —
// usado para notas guardadas antes de este fix, cuyas URLs quedaron como
// texto plano.
export function linkifyHtml(html: string): string {
  const container = document.createElement("div");
  container.innerHTML = html;
  linkifyNode(container);
  return container.innerHTML;
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
  // Notas guardadas antes de que RichTextEditor.tsx linkificara al pegar/
  // migrara al abrir quedaron con URLs como texto plano — se arregla acá
  // también para que NoteCard.tsx y la vista previa de traducción (que solo
  // leen bodyHtml, nunca lo editan) las muestren como link sin depender de
  // que la nota se vuelva a abrir en el editor.
  linkifyNode(container);
  return { textHtml: container.innerHTML, imageFilenames };
}
