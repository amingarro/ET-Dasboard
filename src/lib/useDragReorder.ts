"use client";

import { useState, type DragEvent } from "react";

export function useDragReorder<T extends string>(
  items: T[],
  onReorder: (next: T[]) => void,
) {
  const [draggedId, setDraggedId] = useState<T | null>(null);

  function getItemProps(id: T) {
    return {
      draggable: true,
      onDragStart: () => setDraggedId(id),
      onDragOver: (e: DragEvent<HTMLElement>) => {
        e.preventDefault();
        if (!draggedId || draggedId === id) return;
        const from = items.indexOf(draggedId);
        const to = items.indexOf(id);
        if (from === -1 || to === -1 || from === to) return;
        const next = [...items];
        next.splice(from, 1);
        next.splice(to, 0, draggedId);
        onReorder(next);
      },
      onDrop: (e: DragEvent<HTMLElement>) => e.preventDefault(),
      onDragEnd: () => setDraggedId(null),
      isDragging: draggedId === id,
    };
  }

  return { getItemProps };
}
