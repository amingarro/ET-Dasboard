"use client";

import { SegmentedControl } from "@/components/SegmentedControl";
import { useStore } from "@/lib/store";
import type { DockMode, StoreSchema } from "@/types/electron-api";

const themeOptions: { value: StoreSchema["theme"]; label: string }[] = [
  { value: "light", label: "Claro" },
  { value: "dark", label: "Oscuro" },
  { value: "system", label: "Sistema" },
];

const dockModeOptions: { value: DockMode; label: string }[] = [
  { value: "expanded", label: "Ícono y texto" },
  { value: "compact", label: "Ícono solo" },
  { value: "auto", label: "Automático" },
];

export function AparienciaPanel() {
  const { state, update } = useStore();

  return (
    <div className="flex max-w-lg flex-col gap-6">
      <div className="flex flex-col gap-2">
        <p className="text-sm text-base-content/70">Tema</p>
        <SegmentedControl
          options={themeOptions}
          value={state.theme}
          onChange={(value) => update({ theme: value })}
        />
      </div>

      <div className="flex flex-col gap-2">
        <p className="text-sm text-base-content/70">Menú lateral</p>
        <SegmentedControl
          options={dockModeOptions}
          value={state.dockMode}
          onChange={(value) => update({ dockMode: value })}
        />
        <p className="text-xs text-base-content/50">
          &quot;Ícono y texto&quot; y &quot;Ícono solo&quot; lo dejan siempre visible.
          &quot;Automático&quot; lo oculta y aparece al acercar el mouse al borde.
        </p>
      </div>
    </div>
  );
}
