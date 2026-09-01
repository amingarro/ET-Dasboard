"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";

interface NoteImageCarouselProps {
  filenames: string[];
  onImageClick: (index: number) => void;
}

// Variants de motion/react: "direction" (1 = siguiente, -1 = anterior)
// decide de qué lado entra/sale cada imagen, para que se sienta como un
// slide real y no un corte seco entre fotos.
const slideVariants = {
  enter: (direction: number) => ({ x: direction > 0 ? "100%" : "-100%", opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (direction: number) => ({ x: direction > 0 ? "-100%" : "100%", opacity: 0 }),
};

// Vive en la tarjeta de la lista (NoteCard.tsx) — antes cada imagen de la
// nota se renderizaba a ancho completo una debajo de la otra dentro del
// bodyHtml, así que 3-4 fotos volvían la tarjeta gigante. Esto muestra una
// sola imagen a la vez, en una caja de alto fijo, con flechas/puntos para
// pasar entre ellas — el alto de la tarjeta ya no depende de cuántas fotos tenga.
export function NoteImageCarousel({ filenames, onImageClick }: NoteImageCarouselProps) {
  const [index, setIndex] = useState(0);
  const [direction, setDirection] = useState(0);
  const hasMultiple = filenames.length > 1;

  function go(delta: number, e: React.MouseEvent) {
    e.stopPropagation();
    setDirection(delta);
    setIndex((i) => (i + delta + filenames.length) % filenames.length);
  }

  return (
    <div
      className="group/carousel relative h-40 w-full shrink-0 overflow-hidden rounded-lg bg-black/10"
      onClick={(e) => {
        e.stopPropagation();
        onImageClick(index);
      }}
    >
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
          transition={{ duration: 0.25, ease: "easeInOut" }}
          className="absolute inset-0 h-full w-full cursor-pointer object-cover"
        />
      </AnimatePresence>

      {hasMultiple && (
        <>
          <button
            type="button"
            title="Anterior"
            onClick={(e) => go(-1, e)}
            className="absolute top-1/2 left-1.5 z-10 -translate-y-1/2 cursor-pointer rounded-full bg-black/50 p-1 text-white opacity-0 transition-opacity group-hover/carousel:opacity-100"
          >
            <ChevronLeft size={16} />
          </button>
          <button
            type="button"
            title="Siguiente"
            onClick={(e) => go(1, e)}
            className="absolute top-1/2 right-1.5 z-10 -translate-y-1/2 cursor-pointer rounded-full bg-black/50 p-1 text-white opacity-0 transition-opacity group-hover/carousel:opacity-100"
          >
            <ChevronRight size={16} />
          </button>
          <div className="absolute bottom-1.5 left-1/2 z-10 flex -translate-x-1/2 gap-1">
            {filenames.map((filename, i) => (
              <span
                key={filename}
                className={`h-1.5 w-1.5 rounded-full ${i === index ? "bg-white" : "bg-white/40"}`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
