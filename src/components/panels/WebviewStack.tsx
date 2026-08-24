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
import { getServiceDefinition, type ServiceDefinition } from "@/lib/services";
import { useStore } from "@/lib/store";
import { SplitLayout } from "./SplitLayout";

const GAP = 5;
const RADIUS = 12;
// How long to wait after the last navigation before persisting it — SPAs
// like Gmail/GitHub fire did-navigate-in-page repeatedly while a page is
// settling, and only the final URL is worth writing to disk.
const NAVIGATE_SAVE_DEBOUNCE_MS = 1500;

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
}

interface WebviewNavigateEvent extends Event {
  url: string;
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
}: ServiceWebviewProps) {
  const ref = useRef<HTMLElement | null>(null);
  // Only ever consulted once, at mount — the whole point is remembering
  // where the app was left last time it fully quit, not tracking every live
  // navigation back into the src attribute (which would fight the webview's
  // own in-progress navigation on every debounced save, see onNavigate below).
  const [initialSrc] = useState(() => initialUrl || service.url);

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

    const handleStartLoading = () => onLoadingChange(service.id, true);
    const handleStopLoading = () => onLoadingChange(service.id, false);
    const handleNavigate = (e: Event) => onNavigate(service.id, (e as WebviewNavigateEvent).url);

    el.addEventListener("ipc-message", handleIpcMessage);
    el.addEventListener("did-start-loading", handleStartLoading);
    el.addEventListener("did-stop-loading", handleStopLoading);
    // did-navigate: full page loads. did-navigate-in-page: pushState/hash
    // navigation, which is how Gmail/GitHub/Trello move between screens
    // without a real page load — without this, "remember where I was"
    // would only ever see each service's very first landing URL.
    el.addEventListener("did-navigate", handleNavigate);
    el.addEventListener("did-navigate-in-page", handleNavigate);
    return () => {
      el.removeEventListener("ipc-message", handleIpcMessage);
      el.removeEventListener("did-start-loading", handleStartLoading);
      el.removeEventListener("did-stop-loading", handleStopLoading);
      el.removeEventListener("did-navigate", handleNavigate);
      el.removeEventListener("did-navigate-in-page", handleNavigate);
      onLoadingChange(service.id, false);
    };
  }, [service.id, notificationsEnabled, onLoadingChange, onNavigate]);

  return (
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
  );
}

interface WebviewStackProps {
  onLoadingChange: (id: string, loading: boolean) => void;
}

export function WebviewStack({ onLoadingChange }: WebviewStackProps) {
  const { state, update } = useStore();
  const [rects, setRects] = useState<Record<string, DOMRect>>({});
  const [preloadPath, setPreloadPath] = useState<string | undefined>(undefined);

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
        const current = stateRef.current;
        if (current.services.find((s) => s.id === id)?.lastUrl === url) return;
        const services = current.services.map((s) => (s.id === id ? { ...s, lastUrl: url } : s));
        update({ services });
      }, NAVIGATE_SAVE_DEBOUNCE_MS);
    },
    [update],
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
              </>
            )}
          </Fragment>
        );
      })}
    </div>
  );
}
