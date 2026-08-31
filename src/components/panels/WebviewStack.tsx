"use client";

import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import type { Layout } from "react-resizable-panels";
import { RefreshCw, WifiOff } from "lucide-react";
import { getServiceDefinition, type ServiceDefinition } from "@/lib/services";
import { useStore } from "@/lib/store";
import { SplitLayout } from "./SplitLayout";
import { WebviewToolbar } from "./WebviewToolbar";

const GAP = 5;
const RADIUS = 12;
// Offset of the floating nav toolbar from the frame edge, and its fixed
// height (collapsed and expanded are the same height — it only grows
// sideways — so split-mode positioning can anchor off it without measuring
// the DOM; see splitToolbarPosition below).
const TOOLBAR_MARGIN = 10;
const TOOLBAR_HEIGHT = 40;
// How long to wait after the last navigation before persisting it — SPAs
// like Gmail/GitHub fire did-navigate-in-page repeatedly while a page is
// settling, and only the final URL is worth writing to disk.
const NAVIGATE_SAVE_DEBOUNCE_MS = 1500;
// How many settled URLs the floating toolbar's Back/Forward remembers per
// service. Deliberately app-owned rather than the webview's own
// goBack()/goForward() — embedded SPAs (Figma inside a Jira ticket, in
// particular) can leave native history in a state where "back" does
// nothing useful, which is the exact dead-end this toolbar exists to
// escape. A short, predictable breadcrumb trail beats a long unpredictable
// one for that purpose.
const MAX_TOOLBAR_HISTORY = 5;
// How long to wait between automatic reload attempts once a webview fails to
// load (e.g. no internet) — also the number the countdown badge counts down
// from.
const RETRY_INTERVAL_SECONDS = 30;
// Electron's ERR_ABORTED — fires for perfectly normal cases (a navigation
// superseded by another, a download, a redirect chain) rather than an actual
// failure, so it must not surface as an error overlay.
const ERROR_CODE_ABORTED = -3;

type Corner = "tl" | "tr" | "bl" | "br";
const CORNERS: Corner[] = ["tl", "tr", "bl", "br"];

const MASK_ORIGIN: Record<Corner, string> = {
  tl: "100% 100%",
  tr: "0% 100%",
  bl: "100% 0%",
  br: "0% 0%",
};

function maskGradient(corner: Corner): string {
  return `radial-gradient(circle at ${MASK_ORIGIN[corner]}, transparent 0, transparent ${RADIUS}px, black ${RADIUS}px, black 100%)`;
}

/** Corner mask position when the webview fills the container minus a fixed GAP
 * on every side — doesn't need the container's own size, just CSS edges. */
function fullscreenCornerPosition(corner: Corner): CSSProperties {
  const vertical = corner === "tl" || corner === "tr" ? { top: GAP } : { bottom: GAP };
  const horizontal = corner === "tl" || corner === "bl" ? { left: GAP } : { right: GAP };
  return { ...vertical, ...horizontal };
}

/** Corner mask position from a measured split-panel rect — all in the same
 * top/left coordinate space as WebviewStack's own root (see SplitLayout). */
function splitCornerPosition(corner: Corner, rect: DOMRect): CSSProperties {
  const top = corner === "tl" || corner === "tr" ? rect.top + GAP : rect.top + rect.height - GAP - RADIUS;
  const left = corner === "tl" || corner === "bl" ? rect.left + GAP : rect.left + rect.width - GAP - RADIUS;
  return { top, left };
}

/** Toolbar position when the webview fills the container minus GAP — bottom-left
 * corner, offset inward by TOOLBAR_MARGIN. */
function fullscreenToolbarPosition(): CSSProperties {
  return { bottom: GAP + TOOLBAR_MARGIN, left: GAP + TOOLBAR_MARGIN };
}

/** Toolbar position from a measured split-panel rect, same coordinate space
 * as splitCornerPosition above. */
function splitToolbarPosition(rect: DOMRect): CSSProperties {
  return {
    top: rect.top + rect.height - GAP - TOOLBAR_MARGIN - TOOLBAR_HEIGHT,
    left: rect.left + GAP + TOOLBAR_MARGIN,
  };
}

interface IpcMessageEvent extends Event {
  channel: string;
  args: unknown[];
}

/** A service's own settled-URL breadcrumb trail — see MAX_TOOLBAR_HISTORY. */
interface ToolbarHistory {
  entries: string[];
  index: number;
}

interface ServiceWebviewProps {
  service: ServiceDefinition;
  style: CSSProperties;
  isVisible: boolean;
  preloadPath?: string;
  notificationsEnabled: boolean;
  initialUrl: string | null;
  onLoadingChange: (id: string, loading: boolean) => void;
  onNavigate: (id: string, url: string) => void;
  onRefReady: (id: string, el: WebviewElement | null) => void;
}

interface WebviewNavigateEvent extends Event {
  url: string;
}

interface WebviewFailLoadEvent extends Event {
  errorCode: number;
  errorDescription: string;
  validatedURL: string;
  isMainFrame: boolean;
}

interface LoadError {
  code: number;
  description: string;
}

function ServiceWebview({
  service,
  style,
  isVisible,
  preloadPath,
  notificationsEnabled,
  initialUrl,
  onLoadingChange,
  onNavigate,
  onRefReady,
}: ServiceWebviewProps) {
  const ref = useRef<HTMLElement | null>(null);
  // Only ever consulted once, at mount — the whole point is remembering
  // where the app was left last time it fully quit, not tracking every live
  // navigation back into the src attribute (which would fight the webview's
  // own in-progress navigation on every debounced save, see onNavigate below).
  const [initialSrc] = useState(() => initialUrl || service.url);

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
    (ref.current as WebviewElement | null)?.reload();
  }, [clearRetryInterval]);

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
          (ref.current as WebviewElement | null)?.reload();
          return RETRY_INTERVAL_SECONDS;
        }
        return prev - 1;
      });
    }, 1000);
    return clearRetryInterval;
  }, [loadError, clearRetryInterval]);

  // Separate from the listener effect below so a mute toggle (which changes
  // notificationsEnabled, a dep of that effect) doesn't bounce the ref the
  // floating toolbar's Home/Back/Forward/Copy buttons hold onto.
  useEffect(() => {
    onRefReady(service.id, ref.current as WebviewElement | null);
    return () => onRefReady(service.id, null);
  }, [service.id, onRefReady]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    function handleIpcMessage(e: Event) {
      const event = e as IpcMessageEvent;
      if (event.channel !== "app-notification") return;
      if (!notificationsEnabled) return;
      const payload = event.args[0] as { title: string; body: string };
      window.electronAPI.showNotification({
        serviceId: service.id,
        title: payload.title,
        body: payload.body,
      });
    }

    // Clearing loadError here (rather than on did-finish-load) is
    // deliberate: Electron fires did-finish-load even for its own internal
    // chrome-error://chromewebdata page that a failed navigation lands on,
    // immediately after did-fail-load — clearing there would erase the error
    // state in the same tick it was set. Starting a *new* attempt is the
    // right moment to optimistically clear it instead: did-fail-load will
    // just set it again if that attempt also fails.
    const handleStartLoading = () => {
      onLoadingChange(service.id, true);
      setLoadError(null);
    };
    const handleStopLoading = () => onLoadingChange(service.id, false);
    const handleNavigate = (e: Event) => onNavigate(service.id, (e as WebviewNavigateEvent).url);
    const handleFailLoad = (e: Event) => {
      const event = e as WebviewFailLoadEvent;
      // Only the main-frame navigation matters — a failed sub-resource
      // (favicon, analytics beacon, ad) isn't the page itself being down.
      // ERR_ABORTED is excluded too (see ERROR_CODE_ABORTED above).
      if (!event.isMainFrame || event.errorCode === ERROR_CODE_ABORTED) return;
      setLoadError({ code: event.errorCode, description: event.errorDescription });
    };

    el.addEventListener("ipc-message", handleIpcMessage);
    el.addEventListener("did-start-loading", handleStartLoading);
    el.addEventListener("did-stop-loading", handleStopLoading);
    // did-navigate: full page loads. did-navigate-in-page: pushState/hash
    // navigation, which is how Gmail/GitHub/Trello move between screens
    // without a real page load — without this, "remember where I was"
    // would only ever see each service's very first landing URL.
    el.addEventListener("did-navigate", handleNavigate);
    el.addEventListener("did-navigate-in-page", handleNavigate);
    el.addEventListener("did-fail-load", handleFailLoad);
    return () => {
      el.removeEventListener("ipc-message", handleIpcMessage);
      el.removeEventListener("did-start-loading", handleStartLoading);
      el.removeEventListener("did-stop-loading", handleStopLoading);
      el.removeEventListener("did-navigate", handleNavigate);
      el.removeEventListener("did-navigate-in-page", handleNavigate);
      el.removeEventListener("did-fail-load", handleFailLoad);
      onLoadingChange(service.id, false);
    };
  }, [service.id, notificationsEnabled, onLoadingChange, onNavigate]);

  return (
    <>
      <webview
        ref={ref}
        src={initialSrc}
        partition={service.partition}
        preload={preloadPath}
        className="absolute transition-opacity duration-150 ease-out"
        style={{
          ...style,
          visibility: isVisible ? "visible" : "hidden",
          pointerEvents: isVisible ? "auto" : "none",
          opacity: isVisible ? 1 : 0,
        }}
      />
      {isVisible && loadError && (
        <div
          className="absolute z-20 flex flex-col items-center justify-center gap-3 rounded-xl bg-base-100 p-6 text-center"
          style={style}
        >
          <WifiOff size={36} className="text-base-content/40" />
          <div className="space-y-1">
            <p className="font-medium text-base-content">No se pudo cargar {service.name}</p>
            <p className="text-sm text-base-content/60">{loadError.description}</p>
          </div>
          <button type="button" onClick={handleRetry} className="btn btn-sm btn-primary gap-2">
            <RefreshCw size={14} />
            Reintentar ahora
          </button>
          {retrySeconds !== null && (
            <p className="text-xs text-base-content/50">
              Reintentando automáticamente en {retrySeconds}s…
            </p>
          )}
        </div>
      )}
    </>
  );
}

interface WebviewStackProps {
  onLoadingChange: (id: string, loading: boolean) => void;
}

export function WebviewStack({ onLoadingChange }: WebviewStackProps) {
  const { state, update } = useStore();
  const [rects, setRects] = useState<Record<string, DOMRect>>({});
  const [preloadPath, setPreloadPath] = useState<string | undefined>(undefined);

  // Per-service webview handles for the floating nav toolbar (Home/Back/
  // Forward/Copy URL) — a plain ref map, not state, since the elements
  // themselves never need to trigger a re-render on their own.
  const webviewRefs = useRef<Record<string, WebviewElement | null>>({});
  const [expandedToolbars, setExpandedToolbars] = useState<Record<string, boolean>>({});
  const [toolbarHistory, setToolbarHistory] = useState<Record<string, ToolbarHistory>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
    };
  }, []);

  const handleRefReady = useCallback((id: string, el: WebviewElement | null) => {
    webviewRefs.current[id] = el;
  }, []);

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

  const toggleToolbar = useCallback((id: string) => {
    setExpandedToolbars((prev) => ({ ...prev, [id]: !prev[id] }));
  }, []);

  const handleHome = useCallback((id: string, url: string) => {
    webviewRefs.current[id]?.loadURL(url);
  }, []);

  const handleBack = useCallback((id: string) => {
    setToolbarHistory((prev) => {
      const h = prev[id];
      if (!h || h.index <= 0) return prev;
      const index = h.index - 1;
      webviewRefs.current[id]?.loadURL(h.entries[index]);
      return { ...prev, [id]: { ...h, index } };
    });
  }, []);

  const handleForward = useCallback((id: string) => {
    setToolbarHistory((prev) => {
      const h = prev[id];
      if (!h || h.index >= h.entries.length - 1) return prev;
      const index = h.index + 1;
      webviewRefs.current[id]?.loadURL(h.entries[index]);
      return { ...prev, [id]: { ...h, index } };
    });
  }, []);

  const handleCopyUrl = useCallback((id: string) => {
    const url = webviewRefs.current[id]?.getURL();
    if (!url) return;
    navigator.clipboard.writeText(url).then(() => {
      setCopiedId(id);
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
      copiedTimer.current = setTimeout(() => setCopiedId(null), 1500);
    });
  }, []);

  useEffect(() => {
    window.electronAPI.getWebviewPreloadPath().then(setPreloadPath);
  }, []);

  // Latest state via ref, not a useCallback dependency — handleNavigate must
  // stay referentially stable so the listener-attaching effect in
  // ServiceWebview above doesn't tear down and reattach on every unrelated
  // store change (theme, other services' toggles, etc.).
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);
  const navigateSaveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  useEffect(() => {
    const timers = navigateSaveTimers.current;
    return () => {
      Object.values(timers).forEach(clearTimeout);
    };
  }, []);

  const handleNavigate = useCallback(
    (id: string, url: string) => {
      if (navigateSaveTimers.current[id]) clearTimeout(navigateSaveTimers.current[id]);
      navigateSaveTimers.current[id] = setTimeout(() => {
        pushToolbarHistory(id, url);
        const current = stateRef.current;
        if (current.services.find((s) => s.id === id)?.lastUrl === url) return;
        const services = current.services.map((s) => (s.id === id ? { ...s, lastUrl: url } : s));
        update({ services });
      }, NAVIGATE_SAVE_DEBOUNCE_MS);
    },
    [update, pushToolbarHistory],
  );

  const enabledServices = useMemo(
    () =>
      state.services
        .filter((s) => s.enabled)
        .sort((a, b) => a.order - b.order)
        .map((s) => getServiceDefinition(s.id))
        .filter((s): s is NonNullable<typeof s> => Boolean(s)),
    [state.services],
  );

  const activeGroup = state.layout.groups.find((g) => g.id === state.layout.activeGroupId);
  const isSplit = Boolean(activeGroup && activeGroup.serviceIds.length > 1);
  const panelIds = activeGroup?.serviceIds ?? [];

  const handleRectChange = useCallback((id: string, rect: DOMRect | null) => {
    setRects((prev) => {
      if (!rect) {
        if (!(id in prev)) return prev;
        const next = { ...prev };
        delete next[id];
        return next;
      }
      const prevRect = prev[id];
      if (
        prevRect &&
        prevRect.left === rect.left &&
        prevRect.top === rect.top &&
        prevRect.width === rect.width &&
        prevRect.height === rect.height
      ) {
        return prev;
      }
      return { ...prev, [id]: rect };
    });
  }, []);

  function handleSizesChange(sizes: Layout) {
    if (!activeGroup) return;
    const nextGroups = state.layout.groups.map((g) =>
      g.id === activeGroup.id ? { ...g, splitSizes: sizes } : g,
    );
    update({ layout: { ...state.layout, groups: nextGroups } });
  }

  return (
    <div className="relative flex-1 overflow-hidden bg-base-300">
      {isSplit && activeGroup && (
        <SplitLayout
          groupId={activeGroup.id}
          panelIds={panelIds}
          direction={activeGroup.splitDirection}
          sizes={activeGroup.splitSizes ?? {}}
          onRectChange={handleRectChange}
          onSizesChange={handleSizesChange}
        />
      )}

      {enabledServices.map((service) => {
        const isFullscreenActive = !isSplit && activeGroup?.serviceIds[0] === service.id;
        const splitRect = isSplit && panelIds.includes(service.id) ? rects[service.id] : undefined;
        const isVisible = isFullscreenActive || Boolean(splitRect);

        // The webview itself stays an unclipped rectangle — Electron's <webview>
        // corrupts its own rendering when clipped via border-radius or an
        // overflow:hidden ancestor (tried, broke page loads). The rounded look
        // instead comes from plain sibling overlays painted on top: 4 small corner
        // masks (radial-gradient punching a quarter-circle hole, background-colored
        // everywhere else) hide the webview's square corners, and a transparent
        // bordered div draws the rounded outline. Neither touches the webview's own
        // box, so neither can trigger that bug.
        const webviewStyle: CSSProperties = isFullscreenActive
          ? {
              top: GAP,
              left: GAP,
              width: `calc(100% - ${GAP * 2}px)`,
              height: `calc(100% - ${GAP * 2}px)`,
            }
          : splitRect
            ? {
                top: splitRect.top + GAP,
                left: splitRect.left + GAP,
                width: Math.max(splitRect.width - GAP * 2, 0),
                height: Math.max(splitRect.height - GAP * 2, 0),
              }
            : { top: 0, left: 0, width: 0, height: 0 };

        const frameStyle: CSSProperties = isFullscreenActive
          ? { top: GAP, left: GAP, right: GAP, bottom: GAP }
          : { ...webviewStyle };

        return (
          <Fragment key={service.id}>
            <ServiceWebview
              service={service}
              style={webviewStyle}
              isVisible={isVisible}
              preloadPath={preloadPath}
              notificationsEnabled={
                state.services.find((s) => s.id === service.id)?.notificationsEnabled ?? true
              }
              initialUrl={state.services.find((s) => s.id === service.id)?.lastUrl ?? null}
              onLoadingChange={onLoadingChange}
              onNavigate={handleNavigate}
              onRefReady={handleRefReady}
            />

            {isVisible && (
              <>
                <div
                  className="pointer-events-none absolute rounded-xl border border-base-300"
                  style={frameStyle}
                />
                {CORNERS.map((corner) => (
                  <div
                    key={corner}
                    className="pointer-events-none absolute bg-base-300"
                    style={{
                      width: RADIUS,
                      height: RADIUS,
                      maskImage: maskGradient(corner),
                      WebkitMaskImage: maskGradient(corner),
                      ...(isFullscreenActive
                        ? fullscreenCornerPosition(corner)
                        : splitCornerPosition(corner, splitRect as DOMRect)),
                    }}
                  />
                ))}
                <WebviewToolbar
                  style={
                    isFullscreenActive
                      ? fullscreenToolbarPosition()
                      : splitToolbarPosition(splitRect as DOMRect)
                  }
                  expanded={Boolean(expandedToolbars[service.id])}
                  onToggleExpand={() => toggleToolbar(service.id)}
                  onHome={() => handleHome(service.id, service.url)}
                  onBack={() => handleBack(service.id)}
                  onForward={() => handleForward(service.id)}
                  onCopyUrl={() => handleCopyUrl(service.id)}
                  canGoBack={Boolean(toolbarHistory[service.id] && toolbarHistory[service.id].index > 0)}
                  canGoForward={Boolean(
                    toolbarHistory[service.id] &&
                      toolbarHistory[service.id].index < toolbarHistory[service.id].entries.length - 1,
                  )}
                  copied={copiedId === service.id}
                />
              </>
            )}
          </Fragment>
        );
      })}
    </div>
  );
}
