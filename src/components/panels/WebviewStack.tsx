"use client";

import { useCallback, useMemo, useState, type CSSProperties } from "react";
import type { Layout } from "react-resizable-panels";
import { getServiceDefinition } from "@/lib/services";
import { useStore } from "@/lib/store";
import { SplitLayout } from "./SplitLayout";

const GAP = 5;

export function WebviewStack() {
  const { state, update } = useStore();
  const [rects, setRects] = useState<Record<string, DOMRect>>({});

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

        const style: CSSProperties = isFullscreenActive
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

        return (
          <webview
            key={service.id}
            src={service.url}
            partition={service.partition}
            className="absolute rounded-xl border border-base-300"
            style={{
              ...style,
              visibility: isVisible ? "visible" : "hidden",
              pointerEvents: isVisible ? "auto" : "none",
            }}
          />
        );
      })}
    </div>
  );
}
