"use client";

import { useMemo, type CSSProperties } from "react";
import { Clock, Pin } from "lucide-react";
import { getNoteColorClassName } from "./colors";
import { getDeadlineBreakdown, getDeadlineStatus, splitNoteBody } from "./noteUtils";
import { NoteImageCarousel } from "./NoteImageCarousel";
import type { Note } from "@/types/electron-api";

interface NoteCardProps {
  note: Note;
  onOpen: () => void;
  onTogglePin: () => void;
  onToggleChecklistItem: (itemId: string) => void;
  onOpenImages: (imageFilenames: string[], startIndex: number) => void;
}

export function NoteCard({ note, onOpen, onTogglePin, onToggleChecklistItem, onOpenImages }: NoteCardProps) {
  const colorClassName = getNoteColorClassName(note.color);
  // Separado del bodyHtml para no volver a renderar las imágenes inline (ver
  // NoteImageCarousel.tsx) — si no, N fotos a ancho completo apilan la
  // tarjeta a una altura enorme.
  const { textHtml, imageFilenames } = useMemo(
    () => (note.type === "normal" ? splitNoteBody(note.bodyHtml) : { textHtml: note.bodyHtml, imageFilenames: [] }),
    [note.type, note.bodyHtml],
  );
  const doneCount = note.checklist.filter((item) => item.done).length;
  const progressPct = note.checklist.length
    ? Math.round((doneCount / note.checklist.length) * 100)
    : 0;
  const deadlineStatus = note.deadline ? getDeadlineStatus(note.deadline) : null;
  // A plain box-shadow glow, not daisyUI's `aura` component: aura's glow is a
  // position:absolute + filter:blur pseudo-element, and inside the notes
  // grid's CSS multi-column masonry layout, Chromium fails to clip/contain
  // that pseudo-element correctly (confirmed: contain:paint on the aura span
  // doesn't fix it either) — it balloons into a giant blurred bar bleeding
  // above the whole grid. box-shadow paints within the card's own box during
  // paint, with no separate element/pseudo needing its own containing block,
  // so it can't hit this bug. Costs the aura's rotating shimmer animation —
  // a static glow ring instead — worth it over a broken layout.
  const deadlineGlow: CSSProperties | undefined = deadlineStatus
    ? {
        boxShadow: `0 0 0 1px var(--color-${deadlineStatus === "overdue" ? "error" : "warning"}), 0 0 14px 3px color-mix(in oklch, var(--color-${deadlineStatus === "overdue" ? "error" : "warning"}) 70%, transparent)`,
      }
    : undefined;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter") onOpen();
      }}
      style={deadlineGlow}
      // .note-color-* (defined in globals.css) sets its own background+text
      // color, including for "default" (a pale sticky-note yellow, not the
      // app's neutral bg-base-100) — the bg-base-100 fallback here only
      // matters for a genuinely unrecognized color key.
      className={`card cursor-pointer border border-base-300 shadow-sm transition-shadow hover:shadow-md ${
        colorClassName || "bg-base-100"
      }`}
    >
      <div className="card-body gap-2 p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="card-title text-base">{note.title}</h3>
          <button
            type="button"
            title={note.pinned ? "Desfijar" : "Fijar"}
            onClick={(e) => {
              e.stopPropagation();
              onTogglePin();
            }}
            // bg-current picks up whatever text color this button inherits
            // (the note's own fg when colored, base-content otherwise) —
            // always has a background, never a bare floating-line icon.
            className={`shrink-0 rounded-lg p-1.5 transition-colors ${
              note.pinned ? "bg-current/20" : "bg-current/10 hover:bg-current/15"
            }`}
          >
            <Pin size={14} className={note.pinned ? "fill-current" : "opacity-60"} />
          </button>
        </div>

        {note.deadline && <DeadlineBadge deadline={note.deadline} />}

        {note.type === "normal" ? (
          <>
            {imageFilenames.length > 0 && (
              <NoteImageCarousel filenames={imageFilenames} onImageClick={(index) => onOpenImages(imageFilenames, index)} />
            )}
            {/* bodyHtml es producido por el propio contenteditable de RichTextEditor —
                no es HTML de terceros sin confiar, así que dangerouslySetInnerHTML es seguro acá. */}
            <div
              // No explicit text color here (deliberately) — it inherits the
              // card's own color from the .note-color-* class above. Tailwind's
              // preflight strips default list styling, restored manually since
              // there's no @tailwindcss/typography plugin.
              className="text-sm [&_ul]:list-disc [&_ul]:pl-5"
              dangerouslySetInnerHTML={{ __html: textHtml }}
            />
          </>
        ) : (
          <div className="flex flex-col gap-2">
            {note.checklist.length > 0 && (
              <div className="flex items-center gap-2">
                <progress
                  className="progress h-1.5 flex-1"
                  value={progressPct}
                  max={100}
                  // daisyUI's progress fill is entirely driven by `color`
                  // (currentColor) — same note-palette swap as the checkboxes.
                  style={{ color: `var(--note-${note.color}-fg)` } as CSSProperties}
                />
                <span className="font-mono text-[10px] font-bold opacity-60">{progressPct}%</span>
              </div>
            )}
            <ul className="flex flex-col gap-1.5">
              {note.checklist.map((item) => (
                <li
                  key={item.id}
                  className="flex cursor-pointer items-center gap-2 text-sm"
                  onClick={(e) => {
                    // A discrete flip, saved immediately outside the editor's
                    // debounce — not "editing", just checking something off.
                    e.stopPropagation();
                    onToggleChecklistItem(item.id);
                  }}
                >
                  <input
                    type="checkbox"
                    className="checkbox checkbox-sm"
                    checked={item.done}
                    readOnly
                    // The box's fill (--input-color) and the checkmark's own
                    // color (currentColor, per daisyUI's checkbox.css) are
                    // independently settable — using this note's own fg for
                    // the fill and its bg for the mark reuses the same pair
                    // colors.ts already picked for contrast, just inverted.
                    style={
                      {
                        "--input-color": `var(--note-${note.color}-fg)`,
                        color: `var(--note-${note.color}-bg)`,
                      } as CSSProperties
                    }
                  />
                  <span className={item.done ? "opacity-50 line-through" : ""}>{item.text}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

function DeadlineBadge({ deadline }: { deadline: string }) {
  const isOverdue = getDeadlineStatus(deadline) === "overdue";

  if (isOverdue) {
    return (
      <span className="badge badge-error w-fit gap-1.5 text-xs font-semibold">
        <Clock size={12} />
        Venció
      </span>
    );
  }

  const { days, hours, minutes } = getDeadlineBreakdown(deadline);
  return (
    <div className="flex w-fit items-center gap-1">
      <CountdownSegment value={days} label="días" />
      <span className="text-xs font-bold opacity-30">:</span>
      <CountdownSegment value={hours} label="hs" />
      <span className="text-xs font-bold opacity-30">:</span>
      <CountdownSegment value={minutes} label="min" />
    </div>
  );
}

function CountdownSegment({ value, label }: { value: number; label: string }) {
  return (
    <span className="flex min-w-8 flex-col items-center gap-0 rounded-md bg-current/10 px-1.5 py-0.5">
      {/*
        Plain text, not daisyUI's .countdown component: that component hides
        everything but the current digit via `overflow-y: clip` on a pseudo-
        element digit strip, and that clip genuinely fails to apply inside
        the notes grid's CSS multi-column masonry layout (confirmed: neither
        contain:paint on the value span nor on its .countdown parent stops
        it) — the whole unclipped 00-99 strip paints at full size across
        neighboring cards. The odometer roll was cosmetic; a plain number
        avoids the browser bug entirely instead of fighting it.
      */}
      <span className="font-mono text-sm font-bold leading-none" aria-live="polite">
        {value}
      </span>
      <span className="text-[8px] leading-none font-bold uppercase opacity-70">{label}</span>
    </span>
  );
}
