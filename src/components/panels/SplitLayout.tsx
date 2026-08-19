"use client";

import { Fragment, useEffect, useRef } from "react";
import { Group, Panel, Separator, type Layout } from "react-resizable-panels";

interface SplitLayoutProps {
  groupId: string;
  panelIds: string[];
  direction: "horizontal" | "vertical";
  sizes: Record<string, number>;
  onRectChange: (id: string, rect: DOMRect | null) => void;
  onSizesChange: (sizes: Layout) => void;
}

export function SplitLayout({
  groupId,
  panelIds,
  direction,
  sizes,
  onRectChange,
  onSizesChange,
}: SplitLayoutProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const elementsRef = useRef<Map<string, HTMLDivElement>>(new Map());

  useEffect(() => {
    const observer = new ResizeObserver(() => {
      const container = containerRef.current;
      if (!container) return;
      const containerRect = container.getBoundingClientRect();
      for (const [id, el] of elementsRef.current) {
        const rect = el.getBoundingClientRect();
        onRectChange(
          id,
          new DOMRect(
            rect.left - containerRect.left,
            rect.top - containerRect.top,
            rect.width,
            rect.height,
          ),
        );
      }
    });

    for (const el of elementsRef.current.values()) observer.observe(el);
    if (containerRef.current) observer.observe(containerRef.current);

    return () => observer.disconnect();
  }, [panelIds, onRectChange]);

  return (
    <div ref={containerRef} className="absolute inset-0">
      <Group
        id={`split-${groupId}`}
        orientation={direction}
        defaultLayout={sizes}
        className="h-full w-full"
        onLayoutChanged={(layout, meta) => {
          if (meta.isUserInteraction) onSizesChange(layout);
        }}
      >
        {panelIds.map((panelId, index) => (
          <Fragment key={panelId}>
            {index > 0 && (
              <Separator
                id={`sep-${index}`}
                className={`shrink-0 bg-base-300 transition-colors hover:bg-primary ${
                  direction === "horizontal" ? "w-1 cursor-col-resize" : "h-1 cursor-row-resize"
                }`}
              />
            )}
            <Panel id={panelId} defaultSize={sizes[panelId] ? String(sizes[panelId]) : undefined} minSize="15">
              <div
                ref={(el) => {
                  if (el) elementsRef.current.set(panelId, el);
                  else elementsRef.current.delete(panelId);
                }}
                className="h-full w-full"
              />
            </Panel>
          </Fragment>
        ))}
      </Group>
    </div>
  );
}
