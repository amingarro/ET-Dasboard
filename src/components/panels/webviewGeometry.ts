// Pure positioning geometry for WebviewStack's fullscreen/split layout —
// no React/DOM side effects, just CSSProperties/string values derived from
// fixed constants or a measured DOMRect. Kept separate so the math can be
// read (and unit-tested, if that's ever wanted) without wading through
// WebviewStack's rendering/state concerns.
import type { CSSProperties } from "react";

export const GAP = 5;
export const RADIUS = 12;
// Offset of the floating nav toolbar from the frame edge, and its fixed
// height (collapsed and expanded are the same height — it only grows
// sideways — so split-mode positioning can anchor off it without measuring
// the DOM; see splitToolbarPosition below).
export const TOOLBAR_MARGIN = 10;
export const TOOLBAR_HEIGHT = 40;

export type Corner = "tl" | "tr" | "bl" | "br";
export const CORNERS: Corner[] = ["tl", "tr", "bl", "br"];

export const MASK_ORIGIN: Record<Corner, string> = {
  tl: "100% 100%",
  tr: "0% 100%",
  bl: "100% 0%",
  br: "0% 0%",
};

export function maskGradient(corner: Corner): string {
  return `radial-gradient(circle at ${MASK_ORIGIN[corner]}, transparent 0, transparent ${RADIUS}px, black ${RADIUS}px, black 100%)`;
}

/** Corner mask position when the webview fills the container minus a fixed GAP
 * on every side — doesn't need the container's own size, just CSS edges. */
export function fullscreenCornerPosition(corner: Corner): CSSProperties {
  const vertical = corner === "tl" || corner === "tr" ? { top: GAP } : { bottom: GAP };
  const horizontal = corner === "tl" || corner === "bl" ? { left: GAP } : { right: GAP };
  return { ...vertical, ...horizontal };
}

/** Corner mask position from a measured split-panel rect — all in the same
 * top/left coordinate space as WebviewStack's own root (see SplitLayout). */
export function splitCornerPosition(corner: Corner, rect: DOMRect): CSSProperties {
  const top = corner === "tl" || corner === "tr" ? rect.top + GAP : rect.top + rect.height - GAP - RADIUS;
  const left = corner === "tl" || corner === "bl" ? rect.left + GAP : rect.left + rect.width - GAP - RADIUS;
  return { top, left };
}

/** Toolbar position when the webview fills the container minus GAP — bottom-left
 * corner, offset inward by TOOLBAR_MARGIN. */
export function fullscreenToolbarPosition(): CSSProperties {
  return { bottom: GAP + TOOLBAR_MARGIN, left: GAP + TOOLBAR_MARGIN };
}

/** Toolbar position from a measured split-panel rect, same coordinate space
 * as splitCornerPosition above. */
export function splitToolbarPosition(rect: DOMRect): CSSProperties {
  return {
    top: rect.top + rect.height - GAP - TOOLBAR_MARGIN - TOOLBAR_HEIGHT,
    left: rect.left + GAP + TOOLBAR_MARGIN,
  };
}

// Same fixed height as the nav toolbar (visual consistency, and so its
// position can be computed the same "anchor + constant" way as the toolbar
// itself), stacked directly above it with a small gap.
export const FIGMA_BUTTON_HEIGHT = 40;
const STACK_GAP = 8;

/** FigmaDesignButton position, stacked directly above the fullscreen toolbar. */
export function fullscreenFigmaButtonPosition(): CSSProperties {
  return {
    bottom: GAP + TOOLBAR_MARGIN + TOOLBAR_HEIGHT + STACK_GAP,
    left: GAP + TOOLBAR_MARGIN,
  };
}

/** FigmaDesignButton position, stacked directly above the split-mode toolbar. */
export function splitFigmaButtonPosition(rect: DOMRect): CSSProperties {
  return {
    top: rect.top + rect.height - GAP - TOOLBAR_MARGIN - TOOLBAR_HEIGHT - STACK_GAP - FIGMA_BUTTON_HEIGHT,
    left: rect.left + GAP + TOOLBAR_MARGIN,
  };
}
