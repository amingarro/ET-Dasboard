import { ipcRenderer } from "electron";

// This runs in a browser/renderer context at runtime, but compiles under a
// Node-targeted tsconfig with no DOM lib, so DOM globals are declared
// locally (minimal shapes, only what's actually used) rather than pulling
// in the full DOM lib for a handful of them.
declare const window: {
  Notification: unknown;
  setInterval: (fn: () => void, ms: number) => unknown;
};
declare const document: {
  querySelector: (selector: string) => FigmaIframeElement | null;
};

// Replaces the page's Notification API with a bridge that forwards to the
// host app instead of letting Chromium show its own native OS notification —
// the host renders a themed, animated toast instead. Permission is always
// reported as granted since there's no useful place to show a native
// permission prompt from inside an embedded webview.
interface BridgedNotificationOptions {
  body?: string;
  icon?: string;
  tag?: string;
}

class BridgedNotification {
  static permission = "granted" as const;
  onclick: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onshow: (() => void) | null = null;

  constructor(title: string, options?: BridgedNotificationOptions) {
    ipcRenderer.sendToHost("app-notification", {
      title,
      body: options?.body ?? "",
    });
  }

  static requestPermission(): Promise<"granted"> {
    return Promise.resolve("granted");
  }

  close() {}
  addEventListener() {}
  removeEventListener() {}
}

Object.defineProperty(window, "Notification", {
  value: BridgedNotification,
  writable: false,
  configurable: false,
});

// Jira renders a linked Figma design as a cross-origin
// <iframe src="https://www.figma.com/embed?...&url=<real file url>&...">
// directly inside the ticket page. Clicking inside that iframe only ever
// interacts with FIGMA'S OWN embedded viewer — confirmed by hand that it
// never asks the host for a real popup (sometimes it does nothing visible,
// sometimes it switches its own iframe into a WebGL "Fullscreen" viewer
// mode) — there's nothing to intercept, and the iframe is cross-origin so
// we can't reach inside it either (a known Electron limitation with
// out-of-process iframes).
//
// So don't try to catch a click at all — just report whether this page
// currently has a Figma design embedded, and its real file URL (sitting
// right there in the iframe's own src, no extra lookup needed). The host
// (WebviewStack.tsx) turns that into its own button next to the floating
// nav toolbar; the click that opens WebviewLightbox is entirely ours.
interface FigmaIframeElement {
  src: string;
}

const FIGMA_EMBED_PREFIX = "https://www.figma.com/embed";
let lastReportedUrl: string | null | undefined;

function extractFigmaFileUrl(iframeSrc: string): string | null {
  try {
    return new URL(iframeSrc).searchParams.get("url");
  } catch {
    return null;
  }
}

function reportFigmaDesign() {
  const iframe = document.querySelector(`iframe[src^="${FIGMA_EMBED_PREFIX}"]`);
  const url = iframe ? extractFigmaFileUrl(iframe.src) : null;
  if (url === lastReportedUrl) return;
  lastReportedUrl = url;
  ipcRenderer.sendToHost("figma-design", { url });
}

// Polling instead of a MutationObserver: simpler, and this only needs to
// notice "a Figma iframe appeared/disappeared somewhere on the page" — not
// react to every unrelated DOM mutation Jira's own SPA makes constantly.
window.setInterval(reportFigmaDesign, 500);
