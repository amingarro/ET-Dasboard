"use client";

import { SegmentedControl } from "@/components/SegmentedControl";
import { useStore } from "@/lib/store";
import type { SpellcheckLanguage } from "@/types/electron-api";

const spellcheckOptions: { value: SpellcheckLanguage; label: string }[] = [
  { value: "es", label: "Español" },
  { value: "en", label: "Inglés" },
  { value: "system", label: "Automático" },
];

export function OrtografiaPanel() {
  const { state, update } = useStore();

  return (
    <div className="flex max-w-lg flex-col gap-6">
      <div className="flex flex-col gap-2">
        <p className="text-sm text-base-content/70">Idioma del corrector ortográfico</p>
        <SegmentedControl
          options={spellcheckOptions}
          value={state.spellcheckLanguage}
          onChange={(value) => update({ spellcheckLanguage: value })}
        />
        <p className="text-xs text-base-content/50">
          Se aplica a todos los servicios y a las notas. &quot;Automático&quot; intenta
          detectarlo según el idioma del sistema, y no siempre acierta — si ves palabras
          en español (o inglés) marcadas como error, fijalo manualmente acá.
        </p>
      </div>
    </div>
  );
}
