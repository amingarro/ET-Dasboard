"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Bold, Check, Image as ImageIcon, Italic, List, Plus, Trash2, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { DeleteNoteModal } from "./DeleteNoteModal";
import { NoteColorPicker } from "./NoteColorPicker";
import { RichTextEditor, type RichTextEditorHandle } from "./RichTextEditor";
import { DatePickerPopover } from "./DatePickerPopover";
import { getNoteColorClassName, noteCheckboxStyle } from "./colors";
import type { Note, NoteChecklistItem } from "@/types/electron-api";

const AUTOSAVE_DELAY_MS = 3000;

interface NoteEditorModalProps {
  // Always a real, already-persisted note — Notas.tsx creates it (title
  // "NUEVA NOTA") the instant the user asks for a new one, so this modal
  // never holds unsaved draft state that an accidental backdrop click could
  // discard. Type is fixed at that point too: converting normal<->todo
  // after the fact isn't well-defined, so there's no type toggle here.
  note: Note;
  // True ONLY for a note Notas.tsx just created via createAndOpen — the one
  // case where closing untouched should auto-delete the empty placeholder.
  // An existing note opened just to look at it must never be deleted for
  // being closed unchanged, so this must stay false on that path.
  isNew: boolean;
  onClose: () => void;
  onSave: (note: Note) => void;
  onDelete: (id: string) => void;
  // Abre el mismo lightbox que NoteCard.tsx usa desde la pantalla de notas —
  // ver el prop del mismo nombre en RichTextEditor.tsx.
  onViewImage: (filenames: string[], startIndex: number) => void;
}

export function NoteEditorModal({
  note: initialNote,
  isNew,
  onClose,
  onSave,
  onDelete,
  onViewImage,
}: NoteEditorModalProps) {
  const [title, setTitle] = useState(initialNote.title);
  const [color, setColor] = useState(initialNote.color);
  const [deadline, setDeadline] = useState<string | null>(initialNote.deadline);
  const [bodyHtml, setBodyHtml] = useState(initialNote.bodyHtml);
  const [checklist, setChecklist] = useState<NoteChecklistItem[]>(initialNote.checklist);
  const [newItemText, setNewItemText] = useState("");
  const [hideCompleted, setHideCompleted] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  // Reacts to `color` immediately (swatch clicks aren't gated behind the
  // autosave debounce) — same class NoteCard.tsx applies, so the modal
  // previews exactly what the card will look like once saved.
  const colorClassName = getNoteColorClassName(color);
  const type = initialNote.type;
  const richTextRef = useRef<RichTextEditorHandle>(null);

  const pendingRef = useRef<Note | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function scheduleSave(next: Note) {
    pendingRef.current = next;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      onSave(pendingRef.current!);
      pendingRef.current = null;
      timerRef.current = null;
    }, AUTOSAVE_DELAY_MS);
  }

  function flush() {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (pendingRef.current) {
      onSave(pendingRef.current);
      pendingRef.current = null;
    }
  }

  // Safety net if this ever unmounts through a path other than handleClose.
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        if (pendingRef.current) onSave(pendingRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function commit(patch: Partial<Note>) {
    // updatedAt is stamped by saveNote() itself at actual save time, not here.
    const next: Note = { ...initialNote, title, color, deadline, bodyHtml, checklist, ...patch };
    scheduleSave(next);
  }

  function handleTitleChange(value: string) {
    setTitle(value);
    commit({ title: value });
  }

  function handleColorChange(value: string) {
    setColor(value);
    commit({ color: value });
  }

  function handleDeadlineChange(value: string | null) {
    setDeadline(value);
    commit({ deadline: value });
  }

  function handleBodyChange(value: string) {
    setBodyHtml(value);
    commit({ bodyHtml: value });
  }

  function isUntouched(): boolean {
    return (
      title === initialNote.title &&
      color === initialNote.color &&
      deadline === initialNote.deadline &&
      bodyHtml === initialNote.bodyHtml &&
      checklist.length === initialNote.checklist.length &&
      checklist.every(
        (item, i) =>
          item.text === initialNote.checklist[i]?.text && item.done === initialNote.checklist[i]?.done,
      )
    );
  }

  function handleClose() {
    // Eager creation (see the prop comment above) means closing a brand-new
    // note without typing anything would otherwise leave a stray empty
    // "NUEVA NOTA" sitting in the list — worth cleaning up automatically.
    // Gated on isNew: an EXISTING note opened just to read it and closed
    // unchanged must never be deleted just because nothing changed.
    if (isNew && isUntouched()) {
      onDelete(initialNote.id);
    } else {
      flush();
    }
    onClose();
  }

  function addChecklistItem() {
    const text = newItemText.trim();
    if (!text) return;
    const nextChecklist = [...checklist, { id: crypto.randomUUID(), text, done: false }];
    setChecklist(nextChecklist);
    setNewItemText("");
    commit({ checklist: nextChecklist });
  }

  function updateChecklistItem(id: string, patch: Partial<NoteChecklistItem>) {
    const nextChecklist = checklist.map((item) => (item.id === id ? { ...item, ...patch } : item));
    setChecklist(nextChecklist);
    commit({ checklist: nextChecklist });
  }

  function removeChecklistItem(id: string) {
    const nextChecklist = checklist.filter((item) => item.id !== id);
    setChecklist(nextChecklist);
    commit({ checklist: nextChecklist });
  }

  function toggleAllChecklistItems() {
    const allDone = checklist.length > 0 && checklist.every((item) => item.done);
    const nextChecklist = checklist.map((item) => ({ ...item, done: !allDone }));
    setChecklist(nextChecklist);
    commit({ checklist: nextChecklist });
  }

  function removeCompletedChecklistItems() {
    const nextChecklist = checklist.filter((item) => !item.done);
    setChecklist(nextChecklist);
    commit({ checklist: nextChecklist });
  }

  function handleConfirmDelete() {
    onDelete(initialNote.id);
    setConfirmingDelete(false);
    onClose();
  }

  return (
    <motion.div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-8"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={(e) => {
        // Nested inside Notas' own backdrop — without stopping propagation
        // here, this click would also bubble up and close Notas itself.
        e.stopPropagation();
        handleClose();
      }}
    >
      <motion.div
        className={`card max-h-[88vh] w-full max-w-2xl overflow-y-auto shadow-xl ${colorClassName || "bg-base-100"}`}
        initial={{ opacity: 0, scale: 0.96, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 8 }}
        transition={{ type: "spring", stiffness: 400, damping: 32 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="card-body gap-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold">Editar nota</h3>
            <div className="flex items-center gap-2">
              <NoteColorPicker color={color} onChange={handleColorChange} />
              <button type="button" className="btn btn-soft btn-sm btn-circle" onClick={handleClose}>
                <X size={18} />
              </button>
            </div>
          </div>

          <input
            type="text"
            placeholder="NUEVA NOTA"
            className="input input-bordered w-full"
            value={title}
            onChange={(e) => handleTitleChange(e.target.value)}
          />

          <span className="badge badge-soft w-fit font-semibold">
            {type === "todo" ? "TODO" : "Nota"}
          </span>

          {type === "normal" ? (
            <>
              {/* Fecha y formato en una sola fila, todo a la misma altura
                  (btn-sm, 32px) — antes la barra de herramientas usaba
                  btn-xs (24px) en una fila aparte y quedaba visualmente
                  desalineada y sin jerarquía respecto al resto. */}
              <div className="flex flex-wrap items-center gap-3">
                <DatePickerPopover value={deadline} onChange={handleDeadlineChange} />

                <div className="h-5 w-px bg-base-content/15" />

                <div className="flex h-8 items-center overflow-hidden rounded-full border border-base-content/10 bg-base-content/5">
                  <button
                    type="button"
                    title="Negrita"
                    className="flex h-8 w-8 cursor-pointer items-center justify-center hover:bg-base-content/10"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => richTextRef.current?.exec("bold")}
                  >
                    <Bold size={14} />
                  </button>
                  <button
                    type="button"
                    title="Itálica"
                    className="flex h-8 w-8 cursor-pointer items-center justify-center hover:bg-base-content/10"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => richTextRef.current?.exec("italic")}
                  >
                    <Italic size={14} />
                  </button>
                  <button
                    type="button"
                    title="Lista"
                    className="flex h-8 w-8 cursor-pointer items-center justify-center hover:bg-base-content/10"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => richTextRef.current?.exec("insertUnorderedList")}
                  >
                    <List size={14} />
                  </button>
                </div>

                <button
                  type="button"
                  className="btn btn-soft btn-sm ml-auto gap-2"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => richTextRef.current?.triggerInsertImage()}
                >
                  <ImageIcon size={14} />
                  Insertar imagen
                </button>
              </div>

              <RichTextEditor
                ref={richTextRef}
                value={bodyHtml}
                onChange={handleBodyChange}
                placeholder="Escribí algo…"
                onViewImage={onViewImage}
              />
            </>
          ) : (
            <>
              <DatePickerPopover value={deadline} onChange={handleDeadlineChange} />
              {/* Same checklist widget in create and edit mode — add/toggle/
                  remove already update local `checklist` state regardless of
                  mode; commit() (called internally) is just a no-op until
                  there's a real note to autosave. */}
              <ChecklistEditor
                checklist={checklist}
                color={color}
                hideCompleted={hideCompleted}
                newItemText={newItemText}
                onToggleAll={toggleAllChecklistItems}
                onToggleHideCompleted={() => setHideCompleted((v) => !v)}
                onRemoveCompleted={removeCompletedChecklistItems}
                onUpdateItem={updateChecklistItem}
                onRemoveItem={removeChecklistItem}
                onNewItemTextChange={setNewItemText}
                onAddItem={addChecklistItem}
              />
            </>
          )}

          <button
            type="button"
            className="btn btn-soft btn-error btn-sm w-fit gap-2"
            onClick={() => setConfirmingDelete(true)}
          >
            <Trash2 size={14} />
            Borrar nota
          </button>
        </div>
      </motion.div>

      <AnimatePresence>
        {confirmingDelete && (
          <DeleteNoteModal
            noteTitle={initialNote.title}
            onCancel={() => setConfirmingDelete(false)}
            onConfirm={handleConfirmDelete}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}

interface ChecklistEditorProps {
  checklist: NoteChecklistItem[];
  color: string;
  hideCompleted: boolean;
  newItemText: string;
  onToggleAll: () => void;
  onToggleHideCompleted: () => void;
  onRemoveCompleted: () => void;
  onUpdateItem: (id: string, patch: Partial<NoteChecklistItem>) => void;
  onRemoveItem: (id: string) => void;
  onNewItemTextChange: (value: string) => void;
  onAddItem: () => void;
}

function ChecklistEditor({
  checklist,
  color,
  hideCompleted,
  newItemText,
  onToggleAll,
  onToggleHideCompleted,
  onRemoveCompleted,
  onUpdateItem,
  onRemoveItem,
  onNewItemTextChange,
  onAddItem,
}: ChecklistEditorProps) {
  const doneCount = checklist.filter((item) => item.done).length;
  const allDone = checklist.length > 0 && doneCount === checklist.length;
  const progressPct = checklist.length ? Math.round((doneCount / checklist.length) * 100) : 0;
  const visibleChecklist = hideCompleted ? checklist.filter((item) => !item.done) : checklist;

  return (
    <div className="flex flex-col gap-3 rounded-xl bg-base-200 p-4">
      <div className="flex items-center gap-2.5">
        <button
          type="button"
          title={allDone ? "Destildar todo" : "Tildar todo"}
          onClick={onToggleAll}
          disabled={checklist.length === 0}
          className={`flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center rounded-md disabled:cursor-not-allowed ${
            allDone ? "" : "border-2 border-base-content/25"
          }`}
          // Same fg/bg-swap trick as the item checkboxes below — this button
          // draws its own "checked" fill instead of using a native checkbox.
          style={allDone ? { backgroundColor: `var(--note-${color}-fg)` } : undefined}
        >
          {allDone && <Check size={12} style={{ color: `var(--note-${color}-bg)` }} />}
        </button>
        <span className="flex-1 text-sm font-semibold">Lista de tareas</span>
        <button
          type="button"
          onClick={onToggleHideCompleted}
          className="btn btn-soft btn-xs font-semibold"
        >
          {hideCompleted ? "Mostrar completados" : "Ocultar completados"}
        </button>
        <button
          type="button"
          onClick={onRemoveCompleted}
          disabled={doneCount === 0}
          className="btn btn-soft btn-xs font-semibold"
        >
          Eliminar marcados
        </button>
      </div>

      {checklist.length > 0 && (
        <div className="flex items-center gap-2.5">
          <progress
            className="progress h-1.5 flex-1"
            value={progressPct}
            max={100}
            style={{ color: `var(--note-${color}-fg)` } as CSSProperties}
          />
          <span className="w-8 text-right font-mono text-xs font-bold text-base-content/55">
            {progressPct}%
          </span>
        </div>
      )}

      <div className="flex flex-col">
        {visibleChecklist.map((item) => (
          <div key={item.id} className="group flex items-center gap-2.5 py-1.5">
            <input
              type="checkbox"
              className="checkbox checkbox-sm"
              checked={item.done}
              onChange={(e) => onUpdateItem(item.id, { done: e.target.checked })}
              style={noteCheckboxStyle(color)}
            />
            <input
              type="text"
              value={item.text}
              onChange={(e) => onUpdateItem(item.id, { text: e.target.value })}
              className={`input input-sm input-ghost flex-1 px-1 ${
                item.done ? "opacity-50 line-through" : ""
              }`}
            />
            <button
              type="button"
              title="Borrar ítem"
              onClick={() => onRemoveItem(item.id)}
              className="cursor-pointer rounded p-1 text-base-content/30 opacity-0 hover:bg-base-300 hover:text-error group-hover:opacity-100"
            >
              <X size={14} />
            </button>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2 rounded-lg bg-base-300 px-3 py-1.5">
        <button
          type="button"
          title="Agregar ítem"
          onClick={onAddItem}
          className="shrink-0 cursor-pointer text-base-content/40 hover:text-base-content"
        >
          <Plus size={16} />
        </button>
        <input
          type="text"
          placeholder="Añadir un elemento…"
          className="input input-sm input-ghost flex-1 px-0"
          value={newItemText}
          onChange={(e) => onNewItemTextChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              onAddItem();
            }
          }}
        />
      </div>
    </div>
  );
}
