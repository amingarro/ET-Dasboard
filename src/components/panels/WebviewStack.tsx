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
  onLoadingChange: (id: string, loading: boolean) => void;
}

function ServiceWebview({
  service,
  style,
  isVisible,
  preloadPath,
  notificationsEnabled,
  onLoadingChange,
}: ServiceWebviewProps) {
  const ref = useRef<HTMLElement | null>(null);

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

    el.addEventListener("ipc-message", handleIpcMessage);
    el.addEventListener("did-start-loading", handleStartLoading);
    el.addEventListener("did-stop-loading", handleStopLoading);
    return () => {
      el.removeEventListener("ipc-message", handleIpcMessage);
      el.removeEventListener("did-start-loading", handleStartLoading);
      el.removeEventListener("did-stop-loading", handleStopLoading);
      onLoadingChange(service.id, false);
    };
  }, [service.id, notificationsEnabled, onLoadingChange]);

  return (
    <webview
      ref={ref}
      src={service.url}
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
              onLoadingChange={onLoadingChange}
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
