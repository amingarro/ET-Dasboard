import { ipcRenderer } from "electron";

// Replaces the page's Notification API with a bridge that forwards to the
// host app instead of letting Chromium show its own native OS notification —
// the host renders a themed, animated toast instead. Permission is always
// reported as granted since there's no useful place to show a native
// permission prompt from inside an embedded webview.
//
// This runs in a browser/renderer context at runtime, but compiles under a
// Node-targeted tsconfig with no DOM lib, so `window` is declared locally
// rather than pulling in the full DOM lib for one global.
declare const window: { Notification: unknown };

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
