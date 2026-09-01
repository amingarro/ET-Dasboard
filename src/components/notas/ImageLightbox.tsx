"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Pencil, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import type { Note } from "@/types/electron-api";

interface ImageLightboxProps {
  note: Note;
  filenames: string[];
  startIndex: number;
  onClose: () => void;
  onEdit: () => void;
}

// "direction" (1 = siguiente, -1 = anterior) decide de qué lado entra/sale
// cada imagen — mismo mecanismo que NoteImageCarousel.tsx.
const slideVariants = {
  enter: (direction: number) => ({ x: direction > 0 ? 80 : -80, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (direction: number) => ({ x: direction > 0 ? -80 : 80, opacity: 0 }),
};

// Se abre al hacer click en una imagen del carrusel de NoteCard.tsx (ver
// NoteImageCarousel.tsx) — mismo set de imágenes de la nota, pero grandes y
// con la que se clickeó ya seleccionada. "Editar" cierra esto y abre
// NoteEditorModal en su lugar (Notas.tsx es quien tiene ambos estados y hace
// el cambio de uno a otro).
export function ImageLightbox({ note, filenames, startIndex, onClose, onEdit }: ImageLightboxProps) {
  const [index, setIndex] = useState(startIndex);
  const [direction, setDirection] = useState(0);
  const hasMultiple = filenames.length > 1;

  function goTo(delta: number) {
    setDirection(delta);
    setIndex((i) => (i + delta + filenames.length) % filenames.length);
  }

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft") goTo(-1);
      else if (e.key === "ArrowRight") goTo(1);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filenames.length]);

  return (
    <motion.div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/85 p-8"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={(e) => {
        // Sin esto, el click se propaga al backdrop de Notas.tsx (mismo
        // árbol, ambos con onClick de cierre) y termina cerrando toda la
        // sección de Notas en vez de solo este lightbox.
        e.stopPropagation();
        onClose();
      }}
    >
      <div className="absolute inset-x-4 top-4 flex items-center justify-between text-white">
        <div className="flex items-center gap-3">
          <span className="max-w-xs truncate text-sm font-semibold">{note.title || "NUEVA NOTA"}</span>
          {hasMultiple && (
            <span className="font-mono text-xs text-white/60">
              {index + 1} / {filenames.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            title="Editar nota"
            onClick={(e) => {
              e.stopPropagation();
              onEdit();
            }}
            className="btn btn-sm gap-1.5 border-none bg-white/15 text-white hover:bg-white/25"
          >
            <Pencil size={14} />
            Editar
          </button>
          <button
            type="button"
            title="Cerrar"
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            className="btn btn-sm btn-circle border-none bg-white/15 text-white hover:bg-white/25"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {hasMultiple && (
        <>
          <button
            type="button"
            title="Anterior"
            onClick={(e) => {
              e.stopPropagation();
              goTo(-1);
            }}
            className="btn btn-circle absolute left-4 top-1/2 -translate-y-1/2 border-none bg-white/15 text-white hover:bg-white/25"
          >
            <ChevronLeft size={22} />
          </button>
          <button
            type="button"
            title="Siguiente"
            onClick={(e) => {
              e.stopPropagation();
              goTo(1);
            }}
            className="btn btn-circle absolute right-4 top-1/2 -translate-y-1/2 border-none bg-white/15 text-white hover:bg-white/25"
          >
            <ChevronRight size={22} />
          </button>
        </>
      )}

      {/* Tamaño fijo en el wrapper (no en la imagen) para que, mientras la
          saliente y la entrante se cruzan durante la transición, el
          contenedor no salte de tamaño según cuál de las dos sea más grande.
          pointer-events-none acá + pointer-events-auto en la imagen: el
          "marco" alrededor de la imagen (cuando no es cuadrada) deja pasar el
          click al fondo para cerrar, en vez de bloquear esa zona entera. */}
      <div className="pointer-events-none relative h-[75vh] w-[85vw]">
        <AnimatePresence initial={false} custom={direction} mode="popLayout">
          <motion.img
            key={filenames[index]}
            src={`note-image://${filenames[index]}`}
            alt=""
            custom={direction}
            variants={slideVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="pointer-events-auto absolute inset-0 m-auto max-h-full max-w-full rounded-lg object-contain shadow-xl"
            onClick={(e) => e.stopPropagation()}
          />
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
