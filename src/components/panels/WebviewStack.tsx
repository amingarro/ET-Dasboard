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
import { FigmaDesignButton } from "./FigmaDesignButton";
import { WebviewLightbox } from "./WebviewLightbox";
import {
  GAP,
  RADIUS,
  CORNERS,
  maskGradient,
  fullscreenCornerPosition,
  splitCornerPosition,
  fullscreenToolbarPosition,
  splitToolbarPosition,
  fullscreenFigmaButtonPosition,
  splitFigmaButtonPosition,
} from "./webviewGeometry";
import { useToolbarHistory } from "./useToolbarHistory";
import { useWebviewRetry, ERROR_CODE_ABORTED } from "./useWebviewRetry";

// How long to wait after the last navigation before persisting it — SPAs
// like Gmail/GitHub fire did-navigate-in-page repeatedly while a page is
// settling, and only the final URL is worth writing to disk.
const NAVIGATE_SAVE_DEBOUNCE_MS = 1500;

interface IpcMessageEvent extends Event {
  channel: string;
  args: unknown[];
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
  onFigmaDesign: (id: string, url: string | null | undefined) => void;
}

interface WebviewNavigateEvent extends Event {
  url: string;
  isMainFrame: boolean;
}

// did-frame-navigate: same "a full top-level navigation completed" moment as
// did-navigate, but also reports the HTTP status — used instead of
// did-navigate so an HTTP-level failure (401/403/404/500…) can be told apart
// from a real success. Chromium treats a page that answers with an error
// status as a completed, successful navigation (did-fail-load never fires
// for it — that event is only for network-level failures like DNS/timeout),
// so without this a page like that would otherwise load "successfully" into
// a blank/broken screen with no error card and no way to retry.
interface WebviewFrameNavigateEvent extends Event {
  url: string;
  isMainFrame: boolean;
  // -1 for non-HTTP navigations (e.g. a same-partition redirect chain that
  // never actually hits the network); empty httpStatusText likewise.
  httpResponseCode: number;
  httpStatusText: string;
}

interface WebviewFailLoadEvent extends Event {
  errorCode: number;
  errorDescription: string;
  validatedURL: string;
  isMainFrame: boolean;
}

// Fires for every keydown/keyup inside the guest page, before the guest
// itself sees it — the only way to catch Ctrl+R/Ctrl+Shift+R while focus is
// inside the <webview> (a plain document-level React/DOM keydown listener on
// the host never sees key events typed into the guest's own separate
// renderer process).
interface WebviewBeforeInputEvent extends Event {
  input: {
    type: "keyDown" | "keyUp";
    key: string;
    control: boolean;
    meta: boolean;
    shift: boolean;
  };
}

function isReloadShortcut(key: string, control: boolean, meta: boolean) {
  return key.toLowerCase() === "r" && (control || meta);
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
  onFigmaDesign,
}: ServiceWebviewProps) {
  const ref = useRef<HTMLElement | null>(null);
  // Only ever consulted once, at mount — the whole point is remembering
  // where the app was left last time it fully quit, not tracking every live
  // navigation back into the src attribute (which would fight the webview's
  // own in-progress navigation on every debounced save, see onNavigate below).
  const [initialSrc] = useState(() => initialUrl || service.url);

  const { loadError, setLoadError, retrySeconds, handleRetry } = useWebviewRetry(ref);

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
      if (event.channel === "figma-design") {
        const payload = event.args[0] as { url: string | null };
        onFigmaDesign(service.id, payload.url);
        return;
      }
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
    // isMainFrame guard here mirrors handleFrameNavigate below — a same-document
    // (pushState/hash) navigation happening INSIDE a nested iframe (Figma's
    // embed inside a Jira ticket, for one) also fires this event on the
    // webview's WebContents, with the iframe's own foreign URL. Without this
    // check that foreign URL got persisted as this service's lastUrl, so the
    // NEXT launch booted straight into it (found by hand: Jira's lastUrl kept
    // getting overwritten with figma.com URLs after opening the design panel).
    const handleInPageNavigate = (e: Event) => {
      const event = e as WebviewNavigateEvent;
      if (!event.isMainFrame) return;
      // Back to "searching" — a real navigation means whatever the Figma
      // detector last found (or didn't) is stale until the next poll report.
      onFigmaDesign(service.id, undefined);
      onNavigate(service.id, event.url);
    };
    const handleFrameNavigate = (e: Event) => {
      const event = e as WebviewFrameNavigateEvent;
      // Sub-frame commits (an embedded gadget/iframe loading its own URL)
      // aren't the page itself — only the top document's own navigation
      // should ever surface as an error card or get remembered as lastUrl.
      if (!event.isMainFrame) return;
      if (event.httpResponseCode >= 400) {
        setLoadError({
          code: event.httpResponseCode,
          description: event.httpStatusText || `HTTP ${event.httpResponseCode}`,
        });
        return;
      }
      onFigmaDesign(service.id, undefined);
      onNavigate(service.id, event.url);
    };
    const handleFailLoad = (e: Event) => {
      const event = e as WebviewFailLoadEvent;
      // Only the main-frame navigation matters — a failed sub-resource
      // (favicon, analytics beacon, ad) isn't the page itself being down.
      // ERR_ABORTED is excluded too (see ERROR_CODE_ABORTED above).
      if (!event.isMainFrame || event.errorCode === ERROR_CODE_ABORTED) return;
      setLoadError({ code: event.errorCode, description: event.errorDescription });
    };
    // Ctrl+R / Ctrl+Shift+R (Cmd+R / Cmd+Shift+R on mac) reload this webview
    // even while the guest page itself has keyboard focus — see the type
    // comment on WebviewBeforeInputEvent above for why this can't be a plain
    // document-level keydown listener.
    const handleBeforeInput = (e: Event) => {
      const event = e as WebviewBeforeInputEvent;
      const { input } = event;
      if (input.type !== "keyDown" || !isReloadShortcut(input.key, input.control, input.meta)) return;
      event.preventDefault();
      if (input.shift) {
        (ref.current as WebviewElement | null)?.reloadIgnoringCache();
      } else {
        (ref.current as WebviewElement | null)?.reload();
      }
    };

    el.addEventListener("ipc-message", handleIpcMessage);
    el.addEventListener("before-input-event", handleBeforeInput);
    el.addEventListener("did-start-loading", handleStartLoading);
    el.addEventListener("did-stop-loading", handleStopLoading);
    // did-frame-navigate: full page loads (see the type comment above for
    // why this replaces did-navigate). did-navigate-in-page: pushState/hash
    // navigation, which is how Gmail/GitHub/Trello move between screens
    // without a real page load — without this, "remember where I was"
    // would only ever see each service's very first landing URL.
    el.addEventListener("did-frame-navigate", handleFrameNavigate);
    el.addEventListener("did-navigate-in-page", handleInPageNavigate);
    el.addEventListener("did-fail-load", handleFailLoad);
    return () => {
      el.removeEventListener("ipc-message", handleIpcMessage);
      el.removeEventListener("before-input-event", handleBeforeInput);
      el.removeEventListener("did-start-loading", handleStartLoading);
      el.removeEventListener("did-stop-loading", handleStopLoading);
      el.removeEventListener("did-frame-navigate", handleFrameNavigate);
      el.removeEventListener("did-navigate-in-page", handleInPageNavigate);
      el.removeEventListener("did-fail-load", handleFailLoad);
      onLoadingChange(service.id, false);
    };
  }, [
    service.id,
    service.partition,
    notificationsEnabled,
    onLoadingChange,
    onNavigate,
    onFigmaDesign,
    setLoadError,
  ]);

  return (
    <>
      <webview
        ref={ref}
        src={initialSrc}
        partition={service.partition}
        preload={preloadPath}
        // Sin esto, webview-preload.ts corre en un "isolated world" propio
        // — window.Notification ahí es un objeto distinto del que ve la
        // página real, así que pisarlo no tiene ningún efecto visible y
        // ninguna notificación llega nunca a bridgearse. Estos son sitios
        // en los que el usuario ya confía (Gmail/GitHub/etc, sin
        // nodeIntegration), así que compartir el mundo con el preload acá
        // es un compromiso razonable — es la única forma de que
        // window.Notification = BridgedNotification alcance a la página real.
        webpreferences="contextIsolation=no"
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
  const { toolbarHistory, pushToolbarHistory, handleBack, handleForward } =
    useToolbarHistory(webviewRefs);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // undefined = still searching since the last navigation, null = confirmed
  // no Figma design on this page, string = its real file URL — see
  // FigmaDesignButton and webview-preload.ts's reportFigmaDesign.
  const [figmaUrls, setFigmaUrls] = useState<Record<string, string | null | undefined>>({});
  const figmaSearchTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const FIGMA_SEARCH_TIMEOUT_MS = 3000;

  // A popup a webview tried to open (window.open/target=_blank), denied by
  // main.ts and rerouted here — see WebviewLightbox.tsx. `popupMinimized` is
  // lifted up (rather than local to WebviewLightbox) so the Figma button
  // below can hide itself in favor of the bubble when they'd otherwise
  // occupy the exact same spot.
  const [popup, setPopup] = useState<{ url: string; partition: string } | null>(null);
  const [popupMinimized, setPopupMinimized] = useState(false);
  const openPopup = useCallback((partition: string, url: string) => {
    setPopup({ partition, url });
    setPopupMinimized(false);
  }, []);
  useEffect(() => {
    return window.electronAPI.onWebviewPopup(({ partition, url }) => openPopup(partition, url));
  }, [openPopup]);

  useEffect(() => {
    const timers = figmaSearchTimers.current;
    return () => {
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
      Object.values(timers).forEach(clearTimeout);
    };
  }, []);

  const handleRefReady = useCallback((id: string, el: WebviewElement | null) => {
    webviewRefs.current[id] = el;
  }, []);

  const handleFigmaDesign = useCallback((id: string, url: string | null | undefined) => {
    if (figmaSearchTimers.current[id]) {
      clearTimeout(figmaSearchTimers.current[id]);
      delete figmaSearchTimers.current[id];
    }
    // A real report (found or confirmed absent) settles immediately; only
    // "back to searching" (a fresh navigation) gets a timeout, so the button
    // doesn't say "Buscando…" forever on a page that'll never have a design.
    if (url === undefined) {
      figmaSearchTimers.current[id] = setTimeout(() => {
        setFigmaUrls((prev) => (prev[id] === undefined ? { ...prev, [id]: null } : prev));
      }, FIGMA_SEARCH_TIMEOUT_MS);
    }
    setFigmaUrls((prev) => (prev[id] === url ? prev : { ...prev, [id]: url }));
  }, []);

  const toggleToolbar = useCallback((id: string) => {
    setExpandedToolbars((prev) => ({ ...prev, [id]: !prev[id] }));
  }, []);

  const handleHome = useCallback((id: string, url: string) => {
    webviewRefs.current[id]?.loadURL(url);
  }, []);

  const handleReload = useCallback((id: string) => {
    webviewRefs.current[id]?.reload();
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

  // Fallback for Ctrl+R/Ctrl+Shift+R when focus is on the host chrome (dock,
  // toolbar, settings…) rather than inside a webview — the guest-focused
  // case is handled per-webview via before-input-event in ServiceWebview
  // above, since key events typed into a <webview>'s own renderer process
  // never reach a document-level listener on the host at all.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isReloadShortcut(e.key, e.ctrlKey, e.metaKey)) return;
      e.preventDefault();
      panelIds.forEach((id) => {
        const wv = webviewRefs.current[id];
        if (!wv) return;
        if (e.shiftKey) wv.reloadIgnoringCache();
        else wv.reload();
      });
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [panelIds]);

  // Whichever service actually owns the open popup (matched by partition).
  // Two things depend on this: whether the popup should be visible at all
  // right now (only while its own tab is on screen — a popup opened from
  // Jira has no business floating on top of Gmail after you switch tabs,
  // see WebviewLightbox's `visible` prop) and, when the owner is the
  // Figma-detecting service, where to anchor the minimized bubble so it
  // lands exactly on top of the FigmaDesignButton it's standing in for
  // (falls back to WebviewLightbox's own default corner for any other
  // popup source).
  const popupOwner = popup ? enabledServices.find((s) => s.partition === popup.partition) : undefined;
  const isPopupOwnerFullscreen = Boolean(
    popupOwner && !isSplit && activeGroup?.serviceIds[0] === popupOwner.id,
  );
  const popupOwnerSplitRect =
    isSplit && popupOwner && panelIds.includes(popupOwner.id) ? rects[popupOwner.id] : undefined;
  const isPopupOwnerVisible = isPopupOwnerFullscreen || Boolean(popupOwnerSplitRect);
  const popupAnchorStyle: CSSProperties | undefined =
    popupOwner?.id === "atlassian" && isPopupOwnerVisible
      ? isPopupOwnerFullscreen
        ? fullscreenFigmaButtonPosition()
        : splitFigmaButtonPosition(popupOwnerSplitRect as DOMRect)
      : undefined;

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

      {/* Gated on preloadPath being resolved: mounting a <webview> with
          src set before its preload attribute is known means Electron
          starts that first navigation with no preload script at all, and
          setting preload afterward only takes effect on the *next*
          navigation — for an SPA like Gmail/GitHub that mostly never
          fires another top-level one, the guest page's window.Notification
          override (webview-preload.ts) never installs, so no notification
          ever bridges through for the entire session. */}
      {preloadPath && enabledServices.map((service) => {
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
              onFigmaDesign={handleFigmaDesign}
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
                  onReload={() => handleReload(service.id)}
                  onCopyUrl={() => handleCopyUrl(service.id)}
                  canGoBack={Boolean(toolbarHistory[service.id] && toolbarHistory[service.id].index > 0)}
                  canGoForward={Boolean(
                    toolbarHistory[service.id] &&
                      toolbarHistory[service.id].index < toolbarHistory[service.id].entries.length - 1,
                  )}
                  copied={copiedId === service.id}
                />
                {service.id === "atlassian" &&
                  !(popup && popupMinimized && popup.partition === service.partition) && (
                    <FigmaDesignButton
                      style={
                        isFullscreenActive
                          ? fullscreenFigmaButtonPosition()
                          : splitFigmaButtonPosition(splitRect as DOMRect)
                      }
                      url={figmaUrls[service.id]}
                      onOpen={(url) => openPopup(service.partition, url)}
                    />
                  )}
              </>
            )}
          </Fragment>
        );
      })}

      {popup && (
        <WebviewLightbox
          key={popup.url}
          url={popup.url}
          partition={popup.partition}
          minimized={popupMinimized}
          onMinimizedChange={setPopupMinimized}
          anchorStyle={popupAnchorStyle}
          visible={isPopupOwnerVisible}
          onClose={() => setPopup(null)}
        />
      )}
    </div>
  );
}
