import type { CSSProperties } from "react";

export interface NoteColorOption {
  key: string;
  label: string;
  className: string;
  // Color vívido fijo (no depende del tema) solo para el círculo del
  // selector — los tokens --note-*-bg (ver globals.css) son deliberadamente
  // muy oscuros en dark mode (pensados para ser el fondo completo de una
  // nota, no algo que mirar en un círculo de 24px), así que un swatch que
  // los usa directamente se ve casi todo igual de oscuro y sin contraste.
  // Esta es la única razón de que exista este campo aparte de className.
  swatch: string;
}

export const NOTE_COLORS: NoteColorOption[] = [
  // Classic pale sticky-note yellow, not the app's neutral bg-base-100.
  { key: "default", label: "Sin color", className: "note-color-default", swatch: "#a8a29e" },
  { key: "rose", label: "Rosa", className: "note-color-rose", swatch: "#f43f5e" },
  { key: "orange", label: "Naranja", className: "note-color-orange", swatch: "#f97316" },
  { key: "amber", label: "Ámbar", className: "note-color-amber", swatch: "#f59e0b" },
  { key: "lime", label: "Lima", className: "note-color-lime", swatch: "#84cc16" },
  { key: "emerald", label: "Esmeralda", className: "note-color-emerald", swatch: "#10b981" },
  { key: "sky", label: "Cielo", className: "note-color-sky", swatch: "#0ea5e9" },
  { key: "indigo", label: "Índigo", className: "note-color-indigo", swatch: "#6366f1" },
  { key: "violet", label: "Violeta", className: "note-color-violet", swatch: "#8b5cf6" },
  { key: "pink", label: "Rosa fuerte", className: "note-color-pink", swatch: "#ec4899" },
];

export function getNoteColorClassName(key: string): string {
  return NOTE_COLORS.find((c) => c.key === key)?.className ?? "";
}

// The box's fill (--input-color) and the checkmark's own color (currentColor,
// per daisyUI's checkbox.css) are independently settable — using this note's
// own fg for the fill and its bg for the mark reuses the same pair colors.ts
// already picked for contrast, just inverted. Shared by NoteCard.tsx (list
// view) and NoteEditorModal.tsx's ChecklistEditor (edit view) checkboxes.
export function noteCheckboxStyle(color: string): CSSProperties {
  return {
    "--input-color": `var(--note-${color}-fg)`,
    color: `var(--note-${color}-bg)`,
  } as CSSProperties;
}
