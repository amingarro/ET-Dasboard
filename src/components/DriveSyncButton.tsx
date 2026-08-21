"use client";

import { CloudAlert, LoaderCircle } from "lucide-react";
import { useDriveSync } from "@/lib/driveSync";
import { GoogleDriveLogo } from "./GoogleDriveLogo";

interface DriveSyncButtonProps {
  className?: string;
}

// Shared by Notas.tsx's header and Settings.tsx's Drive section — both just
// need a button that triggers a sync and shows where it's at, so this owns
// its own useDriveSync() instance rather than the parent threading state down.
export function DriveSyncButton({ className }: DriveSyncButtonProps) {
  const { phase, message, sync } = useDriveSync();
  const isSyncing = phase === "auth" || phase === "waiting" || phase === "uploading";

  return (
    <div className={`flex items-center gap-2 ${className ?? ""}`}>
      {message && (
        <span className={`text-xs ${phase === "error" ? "text-error" : "text-base-content/55"}`}>
          {message}
        </span>
      )}
      <button
        type="button"
        title="Sincronizar con Drive"
        className="btn btn-drive-sync btn-sm gap-1.5"
        disabled={isSyncing}
        onClick={sync}
      >
        {isSyncing ? (
          <LoaderCircle size={16} className="animate-spin" />
        ) : phase === "error" ? (
          <CloudAlert size={16} />
        ) : (
          <GoogleDriveLogo size={16} />
        )}
        Sincronizar con Drive
      </button>
    </div>
  );
}
