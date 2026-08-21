import type { DetailedHTMLProps, HTMLAttributes } from "react";

// Unlike electron-webview.d.ts's global `declare namespace JSX` (kept for
// back-compat but apparently not actually what makes <webview> typecheck),
// React 19's own types moved JSX under React.JSX — new custom elements need
// to augment the "react" module directly or TSX won't recognize the tag.
declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      "calendar-date": DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement>;
      "calendar-month": DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement>;
    }
  }
}
