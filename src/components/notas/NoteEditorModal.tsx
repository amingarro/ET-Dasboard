"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Bold, Check, Image as ImageIcon, Italic, Languages, List, Lock, LockOpen, Plus, Trash2, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { DeleteNoteModal } from "./DeleteNoteModal";
import { NoteColorPicker } from "./NoteColorPicker";
import { RichTextEditor, type RichTextEditorHandle } from "./RichTextEditor";
import { DatePickerPopover } from "./DatePickerPopover";
import { getNoteColorClassName, noteCheckboxStyle } from "./colors";
import { splitNoteBody } from "./noteUtils";
import { translateHtml, translateText } from "@/lib/translate";
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
  const [locked, setLocked] = useState(initialNote.locked ?? false);
  const [newItemText, setNewItemText] = useState("");
  const [hideCompleted, setHideCompleted] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  // Reacts to `color` immediately (swatch clicks aren't gated behind the
  // autosave debounce) — same class NoteCard.tsx applies, so the modal
  // previews exactly what the card will look like once saved.
  const colorClassName = getNoteColorClassName(color);
  const type = initialNote.type;
  const richTextRef = useRef<RichTextEditorHandle>(null);

  // Traducción al español (endpoint no oficial de Google Translate), solo
  // dentro del detalle de la nota — NoteCard.tsx en la grilla principal no la
  // muestra. Es una vista previa aparte, no editable: no toca title/bodyHtml/
  // checklist hasta que el usuario pide explícitamente "Reemplazar".
  const [showTranslation, setShowTranslation] = useState(false);
  const [isTranslating, setIsTranslating] = useState(false);
  const [translation, setTranslation] = useState<{
    title: string;
    bodyHtml: string | null; // solo para notas "normal"
    checklist: Record<string, string> | null; // solo para notas "todo"
  } | null>(null);

  // Vista previa de la traducción sin las imágenes (ya se ven arriba, en el
  // contenido original) — mismo split que usa NoteCard.tsx.
  const translatedPreviewHtml = useMemo(
    () => (translation?.bodyHtml ? splitNoteBody(translation.bodyHtml).textHtml : ""),
    [translation],
  );

  async function handleToggleTranslation() {
    if (showTranslation) {
      setShowTranslation(false);
      return;
    }
    if (translation) {
      setShowTranslation(true);
      return;
    }
    setIsTranslating(true);
    try {
      const [translatedTitle, translatedBodyHtml, translatedChecklist] = await Promise.all([
        translateText(title),
        type === "normal" ? translateHtml(bodyHtml) : Promise.resolve(null),
        type === "todo"
          ? Promise.all(checklist.map((item) => translateText(item.text))).then((texts) =>
              Object.fromEntries(checklist.map((item, i) => [item.id, texts[i]])),
            )
          : Promise.resolve(null),
      ]);
      setTranslation({ title: translatedTitle, bodyHtml: translatedBodyHtml, checklist: translatedChecklist });
      setShowTranslation(true);
    } catch (err) {
      console.error("No se pudo traducir la nota", err);
    } finally {
      setIsTranslating(false);
    }
  }

  function handleReplaceWithTranslation() {
    if (!translation) return;
    const patch: Partial<Note> = { title: translation.title };
    setTitle(translation.title);
    if (translation.bodyHtml) {
      patch.bodyHtml = translation.bodyHtml;
      setBodyHtml(translation.bodyHtml);
    }
    if (translation.checklist) {
      const nextChecklist = checklist.map((item) => ({
        ...item,
        text: translation.checklist![item.id] ?? item.text,
      }));
      patch.checklist = nextChecklist;
      setChecklist(nextChecklist);
    }
    commit(patch);
    setTranslation(null);
    setShowTranslation(false);
  }

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
    const next: Note = { ...initialNote, title, color, deadline, bodyHtml, checklist, locked, ...patch };
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

  function handleToggleLock() {
    const value = !locked;
    setLocked(value);
    commit({ locked: value });
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
    // unchanged must never be deleted just because nothing changed. Also
    // gated on !locked: a note locked right after creation, before typing
    // anything, must not be swept away by this cleanup either.
    if (isNew && isUntouched() && !locked) {
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
    if (locked) return; // el botón que abre esta confirmación ya está disabled — defensa extra
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
              <button
                type="button"
                title={locked ? "Desbloquear (permite borrar)" : "Bloquear (evita borrar)"}
                onClick={handleToggleLock}
                className={`btn btn-sm btn-circle ${locked ? "btn-active" : "btn-soft"}`}
              >
                {locked ? <Lock size={16} /> : <LockOpen size={16} />}
              </button>
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

          <div className="flex items-center gap-3">
            <span className="badge badge-soft w-fit font-semibold">
              {type === "todo" ? "TODO" : "Nota"}
            </span>
            <button
              type="button"
              onClick={handleToggleTranslation}
              disabled={isTranslating}
              // currentColor, no text-primary: text-primary es un color fijo
              // del tema que no tiene en cuenta el fg/bg propio de cada
              // .note-color-* (ver NoteCard.tsx) — con notas de fondo oscuro
              // quedaba casi ilegible. bg-current/10 es el mismo tratamiento
              // que usan el botón de fijar y los demás controles de la nota.
              className="flex w-fit cursor-pointer items-center gap-1.5 rounded-lg bg-current/10 px-2 py-1 text-xs font-semibold hover:bg-current/15 disabled:cursor-wait disabled:opacity-60"
            >
              {isTranslating ? (
                <span className="loading loading-spinner loading-xs" />
              ) : (
                <Languages size={13} />
              )}
              {showTranslation ? "Ocultar traducción" : "Mostrar traducción"}
            </button>
          </div>

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

              {showTranslation && translation && (
                <div className="flex flex-col gap-1.5 rounded-xl border border-dashed border-base-content/15 bg-base-300 p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold tracking-wide uppercase opacity-50">Traducción</span>
                    <button
                      type="button"
                      className="btn btn-soft btn-xs font-semibold"
                      onClick={handleReplaceWithTranslation}
                    >
                      Reemplazar
                    </button>
                  </div>
                  {/* No editable: es solo la traducción, no el contenido real de la nota. */}
                  <div
                    className="text-sm opacity-80 [&_ul]:list-disc [&_ul]:pl-5"
                    dangerouslySetInnerHTML={{ __html: translatedPreviewHtml }}
                  />
                </div>
              )}
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
                showTranslation={showTranslation}
                translatedItems={translation?.checklist ?? null}
                onReplaceTranslation={handleReplaceWithTranslation}
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
            title={locked ? "Nota bloqueada — desbloqueala con el candado de arriba para poder borrarla" : undefined}
            disabled={locked}
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
  // Traducción de cada ítem (id -> texto traducido), solo para mostrar — no
  // reemplaza checklist hasta que se toca "Reemplazar".
  showTranslation: boolean;
  translatedItems: Record<string, string> | null;
  onReplaceTranslation: () => void;
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
  showTranslation,
  translatedItems,
  onReplaceTranslation,
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
        {showTranslation && translatedItems && (
          <button type="button" onClick={onReplaceTranslation} className="btn btn-soft btn-xs font-semibold">
            Reemplazar
          </button>
        )}
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
          <div key={item.id} className="flex flex-col">
            <div className="group flex items-start gap-2.5 py-1.5">
              <input
                type="checkbox"
                className="checkbox checkbox-sm mt-1 shrink-0"
                checked={item.done}
                onChange={(e) => onUpdateItem(item.id, { done: e.target.checked })}
                style={noteCheckboxStyle(color)}
              />
              <textarea
                rows={1}
                value={item.text}
                onChange={(e) => onUpdateItem(item.id, { text: e.target.value })}
                onKeyDown={(e) => {
                  // El ítem es de una sola línea lógica — el wrap es visual
                  // (field-sizing: content), Enter no debe insertar un salto.
                  if (e.key === "Enter") {
                    e.preventDefault();
                    e.currentTarget.blur();
                  }
                }}
                // field-sizing: content hace que crezca en alto con el texto
                // en vez de forzarlo a una sola línea con overflow oculto.
                style={{ fieldSizing: "content" } as CSSProperties}
                className={`textarea textarea-ghost min-h-0 flex-1 resize-none px-1 py-1 leading-normal ${
                  item.done ? "opacity-50 line-through" : ""
                }`}
              />
              <button
                type="button"
                title="Borrar ítem"
                onClick={() => onRemoveItem(item.id)}
                className="mt-1 shrink-0 cursor-pointer rounded p-1 text-base-content/30 opacity-0 hover:bg-base-300 hover:text-error group-hover:opacity-100"
              >
                <X size={14} />
              </button>
            </div>
            {/* Traducción del ítem, no editable — solo vista previa hasta "Reemplazar". */}
            {showTranslation && translatedItems?.[item.id] && (
              <div className="ml-7 flex items-start gap-1.5 rounded-md bg-base-300 px-2 py-1 text-xs italic opacity-70">
                <span className="shrink-0">↳</span>
                <span>{translatedItems[item.id]}</span>
              </div>
            )}
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
