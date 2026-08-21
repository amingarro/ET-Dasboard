export interface NoteColorOption {
  key: string;
  label: string;
  className: string;
}

export const NOTE_COLORS: NoteColorOption[] = [
  // Classic pale sticky-note yellow, not the app's neutral bg-base-100.
  { key: "default", label: "Sin color", className: "note-color-default" },
  { key: "rose", label: "Rosa", className: "note-color-rose" },
  { key: "orange", label: "Naranja", className: "note-color-orange" },
  { key: "amber", label: "Ámbar", className: "note-color-amber" },
  { key: "lime", label: "Lima", className: "note-color-lime" },
  { key: "emerald", label: "Esmeralda", className: "note-color-emerald" },
  { key: "sky", label: "Cielo", className: "note-color-sky" },
  { key: "indigo", label: "Índigo", className: "note-color-indigo" },
  { key: "violet", label: "Violeta", className: "note-color-violet" },
  { key: "pink", label: "Rosa fuerte", className: "note-color-pink" },
];

export function getNoteColorClassName(key: string): string {
  return NOTE_COLORS.find((c) => c.key === key)?.className ?? "";
}
