"use client";

import { useCallback, useEffect, useState } from "react";
import type { Note } from "@/types/electron-api";

// Plain hook, not a Context/Provider like store.tsx's StoreProvider — no
// screen other than Notas.tsx needs this data, so it's loaded lazily when
// that screen mounts instead of app-wide at startup.
export function useNotes() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    window.electronAPI.notes.list().then((value) => {
      setNotes(value);
      setLoading(false);
    });
  }, []);

  // Stamps updatedAt here, not at each call site — keeps callers from having
  // to call Date.now() themselves (which the "rules of react" ESLint config
  // flags as an impure call reachable from render when done a few closures
  // away, e.g. a NoteCard prop callback built in Notas.tsx's render).
  const saveNote = useCallback((note: Note) => {
    const stamped = { ...note, updatedAt: Date.now() };
    setNotes((prev) => {
      const exists = prev.some((n) => n.id === stamped.id);
      return exists ? prev.map((n) => (n.id === stamped.id ? stamped : n)) : [...prev, stamped];
    });
    window.electronAPI.notes.save(stamped);
  }, []);

  const deleteNote = useCallback((id: string) => {
    setNotes((prev) => prev.filter((n) => n.id !== id));
    window.electronAPI.notes.delete(id);
  }, []);

  return { notes, loading, saveNote, deleteNote };
}
