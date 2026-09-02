"use client";

import type { CSSProperties } from "react";
import { ArrowDownLeft, ArrowDownRight, ArrowUpLeft, ArrowUpRight, ExternalLink, Minus, X } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { FigmaLogo } from "./FigmaLogo";

interface WebviewLightboxProps {
  url: string;
  partition: string;
  minimized: boolean;
  onMinimizedChange: (minimized: boolean) => void;
  // Where the minimized bubble should sit, in the same coordinate space this
  // component renders in (WebviewStack's own root — see its caller). Passed
  // by WebviewStack when this popup belongs to the Figma-detecting service
  // and that service is currently on screen, so the bubble lands exactly on
  // top of the FigmaDesignButton it's standing in for. Falls back to the
  // fixed bottom-right corner below for any other popup source.
  anchorStyle?: CSSProperties;
  // Whether the service that owns this popup (matched by partition) is the
  // one currently on screen. This component stays mounted regardless — so
  // its <webview> never loses state — but is hidden via CSS while its owner
  // isn't the visible tab, so it doesn't float on top of unrelated services.
  visible: boolean;
  onClose: () => void;
}

const BUBBLE_SIZE = 56;
// Fallback spot when there's no anchorStyle (a popup from a service with no
// button to replace, or opened while that service isn't the visible one) —
// bottom-RIGHT, deliberately clear of the dock, which lives on the left edge.
const BUBBLE_RIGHT = 15;
const BUBBLE_BOTTOM = 5 + 10 + 40 + 10;

// A popup a webview tried to open (window.open/target=_blank) that main.ts
// denied and rerouted here instead — see the setWindowOpenHandler comment in
// electron/main.ts. Shown as an in-app modal on the SAME partition as the
// webview that spawned it, so it's already covered by that partition's
// stripFrameHeaders registration with no extra wiring.
//
// The <webview> stays mounted for this popup's entire lifetime, including
// while minimized (only its wrapper's opacity/pointer-events toggle) — same
// technique ServiceWebview uses for the always-mounted dock webviews — so
// toggling the little bubble never re-navigates or loses scroll/zoom state,
// which is the whole point of minimizing instead of closing.
//
// `minimized` is controlled by the parent (WebviewStack), not local state —
// it needs to know when to hide the real FigmaDesignButton in favor of this
// bubble taking its exact spot (see anchorStyle above). The parent also keys
// this component by `url`, so a genuinely new popup remounts (and gets
// `minimized={false}` fresh) instead of reusing a stale bubble.
export function WebviewLightbox({
  url,
  partition,
  minimized,
  onMinimizedChange,
  anchorStyle,
  visible,
  onClose,
}: WebviewLightboxProps) {
  let hostname = url;
  try {
    hostname = new URL(url).hostname;
  } catch {
    // keep the raw url as a fallback label
  }

  const containerStyle: CSSProperties = minimized
    ? { ...(anchorStyle ?? { right: BUBBLE_RIGHT, bottom: BUBBLE_BOTTOM }), width: BUBBLE_SIZE, height: BUBBLE_SIZE }
    : { top: 40, left: 40, right: 40, bottom: 40 };

  return (
    <div
      style={{
        visibility: visible ? "visible" : "hidden",
        opacity: visible ? 1 : 0,
        pointerEvents: visible ? undefined : "none",
      }}
    >
      <AnimatePresence>
        {!minimized && (
          <motion.div
            className="absolute inset-0 z-[74] bg-black/60"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            // Backdrop click minimizes rather than closes — the point of
            // this whole feature is reading the ticket underneath without
            // losing the popup entirely.
            onClick={() => onMinimizedChange(true)}
          />
        )}
      </AnimatePresence>

      <motion.div
        layout
        // Only the minimized bubble grows on hover — the fullsize modal
        // shouldn't react to hovering its backdrop-covered contents.
        whileHover={minimized ? { scale: 1.08 } : undefined}
        transition={{ type: "spring", stiffness: 320, damping: 32 }}
        className="absolute z-[75] overflow-hidden rounded-2xl border border-base-300 bg-base-100 shadow-2xl"
        style={containerStyle}
      >
        <button
          type="button"
          title={`Reabrir ${hostname}`}
          onClick={() => onMinimizedChange(false)}
          className="absolute inset-0 flex cursor-pointer items-center justify-center bg-[#1e1e1e] text-white/80"
          style={{ opacity: minimized ? 1 : 0, pointerEvents: minimized ? "auto" : "none" }}
        >
          <ArrowUpLeft size={10} className="absolute left-1 top-1 text-white/40" />
          <ArrowUpRight size={10} className="absolute right-1 top-1 text-white/40" />
          <ArrowDownLeft size={10} className="absolute bottom-1 left-1 text-white/40" />
          <ArrowDownRight size={10} className="absolute bottom-1 right-1 text-white/40" />
          <FigmaLogo size={28} />
        </button>

        <div
          className="absolute inset-0 flex flex-col"
          style={{ opacity: minimized ? 0 : 1, pointerEvents: minimized ? "none" : "auto" }}
        >
          <div className="flex shrink-0 items-center justify-between border-b border-base-300 px-3 py-2">
            <span className="truncate text-sm font-medium text-base-content/80">{hostname}</span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                title="Minimizar"
                onClick={() => onMinimizedChange(true)}
                className="btn btn-ghost btn-sm btn-circle"
              >
                <Minus size={14} />
              </button>
              <button
                type="button"
                title="Abrir en el navegador"
                onClick={() => window.electronAPI.openExternal(url)}
                className="btn btn-ghost btn-sm btn-circle"
              >
                <ExternalLink size={14} />
              </button>
              <button type="button" title="Cerrar" onClick={onClose} className="btn btn-ghost btn-sm btn-circle">
                <X size={14} />
              </button>
            </div>
          </div>
          <div className="relative flex-1">
            <webview src={url} partition={partition} className="absolute inset-0 h-full w-full" />
          </div>
        </div>
      </motion.div>
    </div>
  );
}
