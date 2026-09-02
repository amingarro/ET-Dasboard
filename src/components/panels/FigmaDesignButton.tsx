"use client";

import { AnimatePresence, motion } from "motion/react";
import { Loader2 } from "lucide-react";
import type { CSSProperties } from "react";
import { FigmaLogo } from "./FigmaLogo";

interface FigmaDesignButtonProps {
  style: CSSProperties;
  // undefined: no signal yet since the last navigation — show "buscando".
  // null: a report came back and there's no Figma design on this page.
  // string: the design's real file URL, ready to open.
  url: string | null | undefined;
  onOpen: (url: string) => void;
}

// Sits stacked above the floating nav toolbar (see webviewGeometry.ts) — a
// service-agnostic "does this page have a linked Figma design" indicator,
// fed by webview-preload.ts's polling of the guest page's own DOM (see its
// comment for why this doesn't try to intercept a click there instead).
export function FigmaDesignButton({ style, url, onOpen }: FigmaDesignButtonProps) {
  return (
    <AnimatePresence>
      {url !== null && (
        <motion.div
          className="absolute z-10 overflow-hidden rounded-full border border-base-300 bg-base-100/90 shadow-lg backdrop-blur-sm"
          style={style}
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.9 }}
          transition={{ duration: 0.15 }}
        >
          {url === undefined ? (
            <div className="flex h-10 items-center gap-2 px-3 text-sm text-base-content/60">
              <Loader2 size={14} className="animate-spin" />
              Buscando Figma…
            </div>
          ) : (
            <button
              type="button"
              onClick={() => onOpen(url)}
              className="flex h-10 cursor-pointer items-center gap-2 px-3 text-sm font-medium text-base-content/80 hover:bg-base-200"
            >
              <FigmaLogo size={16} />
              Ver diseño
            </button>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
