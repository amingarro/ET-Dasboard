"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useStore } from "@/lib/store";
import { useCrudResource } from "@/lib/useCrudResource";
import type { Note } from "@/types/electron-api";

// How long to wait after the last edit before pushing to Drive — long enough
// that a burst of keystrokes/toggles collapses into one sync instead of one
// per change, short enough that "auto" still feels close to instant.
const AUTO_SYNC_DEBOUNCE_MS = 2000;

// Module-level, not inline at the call site — same reasoning as
// getBirthdaysApi() in birthdays.ts: stable identity, and only touches
// `window.electronAPI` when invoked, not at render/prerender time.
function getNotesApi() {
  return window.electronAPI.notes;
}

// Plain hook, not a Context/Provider like store.tsx's StoreProvider — no
// screen other than Notas.tsx needs this data, so it's loaded lazily when
// that screen mounts instead of app-wide at startup.
export function useNotes() {
  const { items: notes, loading, save, remove, refresh } = useCrudResource<Note>(getNotesApi);
  // Se incrementa cada vez que el proceso principal avisa que las notas
  // cambiaron sin que nos enteremos (un pull de Drive, o una imagen
  // pendiente que terminó de descargarse) — Notas.tsx lo usa como `key` de
  // React para que las tarjetas se remonten y vuelvan a pedir las fuentes
  // note-image:// en vez de saltearse la actualización del DOM porque el
  // *string* de bodyHtml no cambió (solo cambió el archivo en disco que hay detrás).
  const [refreshToken, setRefreshToken] = useState(0);
  const { state } = useStore();
  const driveSyncEnabled = state.driveSyncEnabled;
  const autoSyncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return window.electronAPI.notes.onChanged(() => {
      refresh().then(() => setRefreshToken((v) => v + 1));
    });
  }, [refresh]);

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
      save({ ...note, updatedAt: Date.now() });
      scheduleAutoSync();
    },
    [save, scheduleAutoSync],
  );

  return { notes, loading, refreshToken, saveNote, deleteNote: remove };
}
