"use client";

import type { DragEvent, ReactNode } from "react";
import { GripVertical } from "lucide-react";
import { ServiceIcon } from "@/components/ServiceIcon";
import type { ServiceDefinition } from "@/lib/services";

interface DragItemProps {
  draggable: boolean;
  onDragStart: () => void;
  onDragOver: (e: DragEvent<HTMLElement>) => void;
  onDrop: (e: DragEvent<HTMLElement>) => void;
  onDragEnd: () => void;
}

interface ServiceListItemProps {
  service: ServiceDefinition;
  highlighted: boolean;
  isDragging: boolean;
  dragProps: DragItemProps;
  // "toggle" (Settings): grip+icon+name+right live inside a <label> (right is
  // normally a checkbox), with an optional extra control after it, outside
  // the label. "select" (Onboarding): grip stays outside; icon+name+right
  // sit inside a clickable <button>.
  variant: "toggle" | "select";
  disabled?: boolean;
  onMainClick?: () => void;
  right: ReactNode;
  after?: ReactNode;
}

export function ServiceListItem({
  service,
  highlighted,
  isDragging,
  dragProps,
  variant,
  disabled,
  onMainClick,
  right,
  after,
}: ServiceListItemProps) {
  const grip = (
    <span className="cursor-grab p-2 text-base-content/40 active:cursor-grabbing">
      <GripVertical size={16} />
    </span>
  );
  const icon = <ServiceIcon service={service} size={20} className="shrink-0" />;

  return (
    <li {...dragProps} className={isDragging ? "opacity-40" : undefined}>
      <div
        className={`flex w-full items-center gap-1 rounded-lg border transition-colors ${
          variant === "toggle" ? "pr-2" : "px-2 py-1 text-left"
        } ${highlighted ? "border-primary bg-primary/10" : "border-base-300 hover:bg-base-200"}`}
      >
        {variant === "toggle" ? (
          <>
            <label
              className={`flex flex-1 items-center gap-1 py-1 ${
                disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"
              }`}
            >
              {grip}
              {icon}
              <span className="flex-1 py-2 font-medium">{service.name}</span>
              {right}
            </label>
            {after}
          </>
        ) : (
          <>
            {grip}
            <button
              type="button"
              onClick={onMainClick}
              className="flex flex-1 cursor-pointer items-center gap-3 py-2 text-left"
            >
              {icon}
              <span className="flex-1 font-medium">{service.name}</span>
              {right}
            </button>
          </>
        )}
      </div>
    </li>
  );
}
