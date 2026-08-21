"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useStore } from "@/lib/store";
import type { Note } from "@/types/electron-api";

// How long to wait after the last edit before pushing to Drive — long enough
// that a burst of keystrokes/toggles collapses into one sync instead of one
// per change, short enough that "auto" still feels close to instant.
const AUTO_SYNC_DEBOUNCE_MS = 2000;

// Plain hook, not a Context/Provider like store.tsx's StoreProvider — no
// screen other than Notas.tsx needs this data, so it's loaded lazily when
// that screen mounts instead of app-wide at startup.
export function useNotes() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const { state } = useStore();
  const driveSyncEnabled = state.driveSyncEnabled;
  const autoSyncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    window.electronAPI.notes.list().then((value) => {
      setNotes(value);
      setLoading(false);
    });
  }, []);

  // Debounced, not fired on every single save — while Drive sync is on this
  // is the only thing driving it, no need to also click the button.
  useEffect(() => {
    return () => {
      if (autoSyncTimer.current) clearTimeout(autoSyncTimer.current);
    };
  }, []);

  const scheduleAutoSync = useCallback(() => {
    if (!driveSyncEnabled) return;
    if (autoSyncTimer.current) clearTimeout(autoSyncTimer.current);
    autoSyncTimer.current = setTimeout(() => {
      window.electronAPI.drive.sync();
    }, AUTO_SYNC_DEBOUNCE_MS);
  }, [driveSyncEnabled]);

  // Stamps updatedAt here, not at each call site — keeps callers from having
  // to call Date.now() themselves (which the "rules of react" ESLint config
  // flags as an impure call reachable from render when done a few closures
  // away, e.g. a NoteCard prop callback built in Notas.tsx's render).
  const saveNote = useCallback(
    (note: Note) => {
      const stamped = { ...note, updatedAt: Date.now() };
      setNotes((prev) => {
        const exists = prev.some((n) => n.id === stamped.id);
        return exists ? prev.map((n) => (n.id === stamped.id ? stamped : n)) : [...prev, stamped];
      });
      window.electronAPI.notes.save(stamped);
      scheduleAutoSync();
    },
    [scheduleAutoSync],
  );

  const deleteNote = useCallback((id: string) => {
    setNotes((prev) => prev.filter((n) => n.id !== id));
    window.electronAPI.notes.delete(id);
  }, []);

  return { notes, loading, saveNote, deleteNote };
}
