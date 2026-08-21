"use client";

import { motion } from "motion/react";

interface DeleteNoteModalProps {
  noteTitle: string;
  onCancel: () => void;
  onConfirm: () => void;
}

export function DeleteNoteModal({ noteTitle, onCancel, onConfirm }: DeleteNoteModalProps) {
  return (
    <motion.div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-8"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={(e) => {
        // Nested inside NoteEditorModal's own backdrop — stop it here or it
        // also bubbles up and closes the editor (and Notas) underneath.
        e.stopPropagation();
        onCancel();
      }}
    >
      <motion.div
        className="card w-full max-w-sm bg-base-100 shadow-xl"
        initial={{ opacity: 0, scale: 0.96, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 8 }}
        transition={{ type: "spring", stiffness: 400, damping: 32 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="card-body gap-4">
          <h3 className="text-lg font-bold">¿Borrar nota?</h3>
          <p className="text-sm text-base-content/70">
            Se va a borrar &ldquo;{noteTitle}&rdquo; para siempre. Esta acción no se puede deshacer.
          </p>
          <div className="flex justify-end gap-2">
            <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel}>
              Cancelar
            </button>
            <button type="button" className="btn btn-error btn-sm" onClick={onConfirm}>
              Borrar
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
