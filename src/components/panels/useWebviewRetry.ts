"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

// How long to wait between automatic reload attempts once a webview fails to
// load (e.g. no internet) — also the number the countdown badge counts down
// from.
export const RETRY_INTERVAL_SECONDS = 30;

// Electron's ERR_ABORTED — fires for perfectly normal cases (a navigation
// superseded by another, a download, a redirect chain) rather than an actual
// failure, so it must not surface as an error overlay.
export const ERROR_CODE_ABORTED = -3;

export interface LoadError {
  code: number;
  description: string;
}

/**
 * Automatic-retry-with-countdown behavior for a webview that failed to
 * load. Owns the loadError/retrySeconds state and the countdown ticker;
 * ServiceWebview's own did-fail-load / did-start-loading listeners are
 * responsible for calling the returned `setLoadError` (see the comment at
 * that call site about why clearing happens on start-loading, not
 * did-finish-load — that reasoning lives with the listener, not here).
 */
export function useWebviewRetry(webviewRef: RefObject<HTMLElement | null>) {
  const [loadError, setLoadError] = useState<LoadError | null>(null);
  const [retrySeconds, setRetrySeconds] = useState<number | null>(null);
  const retryIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearRetryInterval = useCallback(() => {
    if (retryIntervalRef.current) {
      clearInterval(retryIntervalRef.current);
      retryIntervalRef.current = null;
    }
  }, []);

  const handleRetry = useCallback(() => {
    clearRetryInterval();
    setRetrySeconds(null);
    (webviewRef.current as WebviewElement | null)?.reload();
  }, [clearRetryInterval, webviewRef]);

  // Reset the countdown display whenever loadError changes identity — a new
  // error, or a fresh one re-raised by a failed retry (setLoadError always
  // produces a new object). Adjusting state during render, per
  // https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes,
  // rather than in an effect body, since this is purely derived from
  // loadError and shouldn't cause an extra commit.
  const [prevLoadError, setPrevLoadError] = useState(loadError);
  if (loadError !== prevLoadError) {
    setPrevLoadError(loadError);
    setRetrySeconds(loadError ? RETRY_INTERVAL_SECONDS : null);
  }

  // Runs the actual countdown ticker while a load error is present, and
  // fires a reload when it hits zero. Torn down entirely once did-finish-load
  // clears loadError.
  useEffect(() => {
    if (!loadError) {
      clearRetryInterval();
      return;
    }
    retryIntervalRef.current = setInterval(() => {
      setRetrySeconds((prev) => {
        if (prev === null) return prev;
        if (prev <= 1) {
          (webviewRef.current as WebviewElement | null)?.reload();
          return RETRY_INTERVAL_SECONDS;
        }
        return prev - 1;
      });
    }, 1000);
    return clearRetryInterval;
  }, [loadError, clearRetryInterval, webviewRef]);

  return { loadError, setLoadError, retrySeconds, handleRetry };
}
