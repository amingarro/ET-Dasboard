// Subset of Electron's WebviewTag methods this app drives directly from the
// renderer (navigation for the floating per-service toolbar in
// WebviewStack.tsx, which keeps its own Back/Forward breadcrumb trail
// rather than relying on the guest page's native session history — see
// MAX_TOOLBAR_HISTORY there). The <webview> tag is a plain HTMLElement as
// far as React/TS know it (see the JSX.IntrinsicElements override below),
// so ref consumers cast to this interface to call these without `any`.
interface WebviewElement extends HTMLElement {
  loadURL(url: string): Promise<void>;
  getURL(): string;
  reload(): void;
  reloadIgnoringCache(): void;
}

declare namespace JSX {
  interface IntrinsicElements {
    webview: React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
      src?: string;
      partition?: string;
      allowpopups?: string;
      preload?: string;
      webpreferences?: string;
    };
  }
}
