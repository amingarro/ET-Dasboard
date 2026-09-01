"use client";

import { useCallback, useEffect, useState } from "react";

export type DriveSyncPhase = "idle" | "auth" | "waiting" | "uploading" | "downloading" | "done" | "error";

// Plain hook (same reasoning as useNotes in notes.ts): only Notas.tsx's
// header button needs this, no app-wide provider warranted.
export function useDriveSync() {
  const [phase, setPhase] = useState<DriveSyncPhase>("idle");
  const [message, setMessage] = useState("");
  // Imágenes que Drive conoce pero la caché local no — se exponen para que
  // la UI le pregunte al usuario antes de descargarlas (podría ser mucho peso).
  const [pendingImages, setPendingImages] = useState<string[]>([]);

  useEffect(() => {
    return window.electronAPI.drive.onSyncStatus((status) => {
      setPhase(status.phase);
      setMessage(status.message);
    });
  }, []);

  useEffect(() => window.electronAPI.drive.onImagesPending(setPendingImages), []);

  const sync = useCallback(async () => {
    setPhase("auth");
    setMessage("Iniciando sincronización…");
    const result = await window.electronAPI.drive.sync();
    if (!result.ok) {
      setPhase("error");
      setMessage(result.error ?? "No se pudo sincronizar con Drive.");
    }
  }, []);

  const downloadPendingImages = useCallback(async () => {
    const filenames = pendingImages;
    setPendingImages([]);
    const result = await window.electronAPI.drive.downloadPendingImages(filenames);
    if (!result.ok) {
      setPhase("error");
      setMessage(result.error ?? "No se pudieron descargar las imágenes.");
    }
  }, [pendingImages]);

  const dismissPendingImages = useCallback(() => setPendingImages([]), []);

  return { phase, message, sync, pendingImages, downloadPendingImages, dismissPendingImages };
}
