"use client";

import { useCallback, useState, type RefObject } from "react";

// How many settled URLs the floating toolbar's Back/Forward remembers per
// service. Deliberately app-owned rather than the webview's own
// goBack()/goForward() — embedded SPAs (Figma inside a Jira ticket, in
// particular) can leave native history in a state where "back" does
// nothing useful, which is the exact dead-end this toolbar exists to
// escape. A short, predictable breadcrumb trail beats a long unpredictable
// one for that purpose.
const MAX_TOOLBAR_HISTORY = 5;

/** A service's own settled-URL breadcrumb trail — see MAX_TOOLBAR_HISTORY. */
interface ToolbarHistory {
  entries: string[];
  index: number;
}

/**
 * The floating per-service toolbar's own Back/Forward breadcrumb trail —
 * see MAX_TOOLBAR_HISTORY for why this exists instead of relying on the
 * webview's native session history. `webviewRefs` is the same plain ref map
 * WebviewStack already keeps for Home/Copy URL, passed in so Back/Forward
 * can dispatch loadURL against whichever webview element is currently
 * registered for that service id.
 */
export function useToolbarHistory(webviewRefs: RefObject<Record<string, WebviewElement | null>>) {
  const [toolbarHistory, setToolbarHistory] = useState<Record<string, ToolbarHistory>>({});

  // Records a settled navigation into the toolbar's own short breadcrumb
  // trail (see MAX_TOOLBAR_HISTORY). A no-op when `url` is exactly where
  // Back/Forward just parked the pointer, so stepping through the trail
  // doesn't re-push the entry it lands on as if it were a fresh visit.
  const pushToolbarHistory = useCallback((id: string, url: string) => {
    setToolbarHistory((prev) => {
      const h = prev[id];
      if (h && h.entries[h.index] === url) return prev;
      const kept = h ? h.entries.slice(0, h.index + 1) : [];
      const entries = [...kept, url].slice(-MAX_TOOLBAR_HISTORY);
      return { ...prev, [id]: { entries, index: entries.length - 1 } };
    });
  }, []);

  const handleBack = useCallback(
    (id: string) => {
      setToolbarHistory((prev) => {
        const h = prev[id];
        if (!h || h.index <= 0) return prev;
        const index = h.index - 1;
        webviewRefs.current[id]?.loadURL(h.entries[index]);
        return { ...prev, [id]: { ...h, index } };
      });
    },
    [webviewRefs],
  );

  const handleForward = useCallback(
    (id: string) => {
      setToolbarHistory((prev) => {
        const h = prev[id];
        if (!h || h.index >= h.entries.length - 1) return prev;
        const index = h.index + 1;
        webviewRefs.current[id]?.loadURL(h.entries[index]);
        return { ...prev, [id]: { ...h, index } };
      });
    },
    [webviewRefs],
  );

  return { toolbarHistory, pushToolbarHistory, handleBack, handleForward };
}
