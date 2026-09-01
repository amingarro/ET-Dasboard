"use client";

import { ImageDown, LoaderCircle, X } from "lucide-react";
import { useDriveSync } from "@/lib/driveSync";

// Widget autocontenido con su propia instancia de useDriveSync() — mismo
// razonamiento que DriveSyncButton.tsx: ninguna otra pantalla más que
// Notas.tsx necesita esto, no hace falta pasar el estado de sync desde un padre.
export function PendingImagesPrompt() {
  const { phase, pendingImages, downloadPendingImages, dismissPendingImages } = useDriveSync();

  if (pendingImages.length === 0) return null;

  const isDownloading = phase === "downloading";

  return (
    <div className="flex items-center gap-3 rounded-xl border border-base-300 bg-base-200 px-4 py-2.5 text-sm">
      <ImageDown size={16} className="shrink-0 text-base-content/60" />
      <span className="flex-1">
        Faltan descargar {pendingImages.length} {pendingImages.length === 1 ? "imagen" : "imágenes"} de tus notas.
      </span>
      <button
        type="button"
        className="btn btn-primary btn-xs gap-1.5"
        disabled={isDownloading}
        onClick={downloadPendingImages}
      >
        {isDownloading && <LoaderCircle size={12} className="animate-spin" />}
        Aceptar
      </button>
      <button
        type="button"
        title="Cancelar"
        className="btn btn-ghost btn-xs btn-circle"
        disabled={isDownloading}
        onClick={dismissPendingImages}
      >
        <X size={14} />
      </button>
    </div>
  );
}
