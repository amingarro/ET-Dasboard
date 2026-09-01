"use client";

import { useEffect, useRef, useState } from "react";
import { Paintbrush } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { NOTE_COLORS } from "./colors";

interface NoteColorPickerProps {
  color: string;
  onChange: (color: string) => void;
}

// Antes las 10 opciones de color eran una fila fija siempre visible debajo
// del título — esto las reemplaza por un botón "pincel" junto a la X de
// cerrar: al pasar el mouse, se despliegan hacia la izquierda con una
// animación en cascada, y se repliegan al sacar el mouse.
export function NoteColorPicker({ color, onChange }: NoteColorPickerProps) {
  const [open, setOpen] = useState(false);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    };
  }, []);

  function handleEnter() {
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    setOpen(true);
  }

  function handleLeave() {
    // Un pequeño margen antes de cerrar de verdad: moverse del botón al
    // panel desplegado cruza un instante de "hueco" entre ambos elementos
    // que, sin este delay, dispara un mouseleave real y hace que el picker
    // parpadee (se cierra y se vuelve a abrir) en vez de quedarse abierto.
    closeTimerRef.current = setTimeout(() => setOpen(false), 150);
  }

  return (
    <div className="relative flex items-center" onMouseEnter={handleEnter} onMouseLeave={handleLeave}>
      <AnimatePresence>
        {open && (
          <motion.div
            className="absolute right-full flex items-center gap-1.5 rounded-full bg-base-100 px-2.5 py-2 shadow-lg"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.1 } }}
            transition={{ duration: 0.15, ease: "easeOut" }}
          >
            {NOTE_COLORS.map((option, i) => (
              <motion.button
                key={option.key}
                type="button"
                title={option.label}
                onClick={() => onChange(option.key)}
                initial={{ opacity: 0, scale: 0, x: 10 }}
                animate={{ opacity: 1, scale: 1, x: 0 }}
                transition={{ duration: 0.18, delay: i * 0.02, ease: "backOut" }}
                style={{ backgroundColor: option.swatch }}
                className={`h-6 w-6 shrink-0 cursor-pointer rounded-full border-2 transition-transform duration-100 hover:scale-125 ${
                  color === option.key ? "border-primary" : "border-base-300"
                }`}
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      <button type="button" title="Elegir color" className="btn btn-soft btn-sm btn-circle">
        <Paintbrush size={16} />
      </button>
    </div>
  );
}
