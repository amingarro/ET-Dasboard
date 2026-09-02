"use client";

import { DriveSyncButton } from "@/components/DriveSyncButton";
import { useStore } from "@/lib/store";

export function SyncPanel() {
  const { state, update } = useStore();

  function toggleDriveSync() {
    const enabling = !state.driveSyncEnabled;
    update({ driveSyncEnabled: enabling });
    // Turning it on shouldn't wait for the next note edit to prove it works —
    // this also doubles as the trigger for the very first login.
    if (enabling) window.electronAPI.drive.sync();
  }

  return (
    <div className="flex max-w-lg flex-col gap-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm text-base-content/70">Sincronizar Notas automáticamente</p>
          <p className="text-xs text-base-content/50">
            Cada cambio en una nota se sube solo, sin apretar el botón.
          </p>
        </div>
        <input
          type="checkbox"
          className="toggle toggle-primary shrink-0"
          checked={state.driveSyncEnabled}
          onChange={toggleDriveSync}
        />
      </div>
      <DriveSyncButton />
    </div>
  );
}
