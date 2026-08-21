"use client";

import { useCallback, useEffect, useState } from "react";

export type DriveSyncPhase = "idle" | "auth" | "waiting" | "uploading" | "done" | "error";

// Plain hook (same reasoning as useNotes in notes.ts): only Notas.tsx's
// header button needs this, no app-wide provider warranted.
export function useDriveSync() {
  const [phase, setPhase] = useState<DriveSyncPhase>("idle");
  const [message, setMessage] = useState("");

  useEffect(() => {
    return window.electronAPI.drive.onSyncStatus((status) => {
      setPhase(status.phase);
      setMessage(status.message);
    });
  }, []);

  const sync = useCallback(async () => {
    setPhase("auth");
    setMessage("Iniciando sincronización…");
    const result = await window.electronAPI.drive.sync();
    if (!result.ok) {
      setPhase("error");
      setMessage(result.error ?? "No se pudo sincronizar con Drive.");
    }
  }, []);

  return { phase, message, sync };
}
