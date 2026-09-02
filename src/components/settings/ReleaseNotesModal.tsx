"use client";

import { useEffect, useState } from "react";
import { Sparkles, X } from "lucide-react";
import { motion } from "motion/react";
import type { ReleaseNoteEntry } from "@/types/electron-api";

interface ReleaseNotesModalProps {
  onClose: () => void;
}

export function ReleaseNotesModal({ onClose }: ReleaseNotesModalProps) {
  const [entries, setEntries] = useState<ReleaseNoteEntry[] | null>(null);

  useEffect(() => {
    window.electronAPI.releaseNotes.list().then(setEntries);
  }, []);

  return (
    <motion.div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-8"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={(e) => {
        // Nested inside Settings' own backdrop — stop it here or it also
        // bubbles up and closes Settings underneath.
        e.stopPropagation();
        onClose();
      }}
    >
      <motion.div
        className="card max-h-[80vh] w-full max-w-lg overflow-hidden bg-base-100 shadow-xl"
        initial={{ opacity: 0, scale: 0.96, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 8 }}
        transition={{ type: "spring", stiffness: 400, damping: 32 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex max-h-[80vh] flex-col">
          <div className="flex items-center justify-between border-b border-base-300 px-6 py-4">
            <div className="flex items-center gap-2">
              <Sparkles size={18} className="text-primary" />
              <h2 className="text-lg font-bold">Novedades</h2>
            </div>
            <button type="button" className="btn btn-ghost btn-sm btn-circle" onClick={onClose}>
              <X size={18} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-6">
            {entries === null ? (
              <p className="text-sm text-base-content/50">Cargando…</p>
            ) : (
              <div className="flex flex-col gap-6">
                {entries.map((entry, index) => (
                  <div key={entry.version} className="flex flex-col gap-2">
                    <div className="flex items-baseline gap-2">
                      <h3 className="font-semibold">Versión {entry.version}</h3>
                      {index === 0 && (
                        <span className="badge badge-primary badge-xs">Actual</span>
                      )}
                      <span className="text-xs text-base-content/50">{entry.date}</span>
                    </div>
                    <ul className="flex list-disc flex-col gap-1.5 pl-5 text-sm text-base-content/75">
                      {entry.notes.map((note, i) => (
                        <li key={i}>{note}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
