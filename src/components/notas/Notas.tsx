"use client";

import { useState } from "react";
import { CalendarDays, ListChecks, Palette, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { DriveSyncButton } from "@/components/DriveSyncButton";
import { useNotes } from "@/lib/notes";
import { NoteCard } from "./NoteCard";
import { NoteEditorModal } from "./NoteEditorModal";
import { NotasLogo } from "./NotasLogo";
import { createNote } from "./noteUtils";
import type { Note, NoteType } from "@/types/electron-api";

interface NotasProps {
  onClose: () => void;
}

export function Notas({ onClose }: NotasProps) {
  const { notes, loading, saveNote, deleteNote } = useNotes();
  // isNew: true only for a note just created via createAndOpen below — that
  // (and only that) is what NoteEditorModal is allowed to auto-delete if
  // closed untouched. Opening an EXISTING note to just look at it and
  // closing again must never delete it — isNew stays false for that path.
  const [editorState, setEditorState] = useState<{ note: Note; isNew: boolean } | null>(null);

  // Creates the note immediately (title "NUEVA NOTA", autosaves from the
  // very first keystroke) instead of holding it as unsaved draft state in
  // the modal — an accidental backdrop click used to discard everything
  // typed, since nothing existed on disk yet to protect. Opening the editor
  // on an already-real note means the same flush-on-close safety net that
  // already covers editing an existing note covers this too.
  function createAndOpen(type: NoteType = "normal") {
    const note = createNote({ title: "NUEVA NOTA", type });
    saveNote(note);
    setEditorState({ note, isNew: true });
  }

  function toggleChecklistItem(note: Note, itemId: string) {
    const checklist = note.checklist.map((item) =>
      item.id === itemId ? { ...item, done: !item.done } : item,
    );
    saveNote({ ...note, checklist });
  }

  function togglePin(note: Note) {
    saveNote({ ...note, pinned: !note.pinned });
  }

  const pinned = notes.filter((n) => n.pinned);
  const unpinned = notes.filter((n) => !n.pinned);

  function renderGrid(list: Note[]) {
    // CSS multi-column, not CSS grid: a row-based grid forces every card in
    // a row to the same visual row band even with items-start (short cards
    // just leave a gap below them instead of the next row sliding up).
    // `columns` packs each card into whichever column is next in reading
    // order, top-to-bottom per column — no dependency needed, this is what
    // the Keep-style reference screenshot's layout actually is.
    return (
      <div className="columns-[220px] gap-4">
        {list.map((note) => (
          // break-inside-avoid on the wrapper (not NoteCard itself) keeps a
          // card from being split across a column break.
          <div key={note.id} className="mb-4 break-inside-avoid">
            <NoteCard
              note={note}
              onOpen={() => setEditorState({ note, isNew: false })}
              onTogglePin={() => togglePin(note)}
              onToggleChecklistItem={(itemId) => toggleChecklistItem(note, itemId)}
            />
          </div>
        ))}
      </div>
    );
  }

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-8"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className="card h-full w-full max-w-6xl bg-base-100 shadow-xl"
        initial={{ opacity: 0, scale: 0.96, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 8 }}
        transition={{ type: "spring", stiffness: 400, damping: 32 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="card-body gap-4 overflow-y-auto">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <NotasLogo size={22} />
              <div>
                <h2 className="text-xl leading-tight font-bold">Notas</h2>
                <p className="text-xs leading-tight text-base-content/55">
                  {notes.length} {notes.length === 1 ? "nota" : "notas"}
                  {pinned.length > 0 &&
                    ` · ${pinned.length} ${pinned.length === 1 ? "fijada" : "fijadas"}`}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <DriveSyncButton />
              <button type="button" className="btn btn-soft btn-sm btn-circle" onClick={onClose}>
                <X size={18} />
              </button>
            </div>
          </div>

          <div className="flex h-13 max-w-xl items-center gap-2.5 rounded-2xl border border-base-300 bg-base-100 pr-2 pl-5 shadow-sm">
            <button
              type="button"
              className="flex-1 cursor-text text-left text-sm text-base-content/45"
              onClick={() => createAndOpen("normal")}
            >
              Crear una nota…
            </button>
            <button
              type="button"
              title="Nueva lista TODO"
              className="btn btn-soft btn-square btn-sm"
              onClick={() => createAndOpen("todo")}
            >
              <ListChecks size={18} />
            </button>
            <button
              type="button"
              title="Elegir color"
              className="btn btn-soft btn-square btn-sm"
              onClick={() => createAndOpen("normal")}
            >
              <Palette size={18} />
            </button>
            <button
              type="button"
              title="Poner fecha límite"
              className="btn btn-soft btn-square btn-sm"
              onClick={() => createAndOpen("normal")}
            >
              <CalendarDays size={18} />
            </button>
          </div>

          {loading ? (
            <p className="text-sm text-base-content/50">Cargando…</p>
          ) : notes.length === 0 ? (
            <p className="text-sm text-base-content/50">No hay notas todavía.</p>
          ) : (
            <div className="flex flex-col gap-4">
              {pinned.length > 0 && (
                <div className="flex flex-col gap-2">
                  <p className="text-xs font-semibold tracking-wide text-base-content/50">FIJADAS</p>
                  {renderGrid(pinned)}
                </div>
              )}
              {unpinned.length > 0 && renderGrid(unpinned)}
            </div>
          )}
        </div>
      </motion.div>

      <AnimatePresence>
        {editorState && (
          <NoteEditorModal
            note={editorState.note}
            isNew={editorState.isNew}
            onClose={() => setEditorState(null)}
            onSave={saveNote}
            onDelete={deleteNote}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}
