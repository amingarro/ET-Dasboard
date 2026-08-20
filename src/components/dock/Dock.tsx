"use client";

import { useRef, useState, type CSSProperties, type DragEvent, type ReactNode } from "react";
import { SplitSquareHorizontal, SplitSquareVertical, X } from "lucide-react";
import { motion } from "motion/react";
import { getServiceDefinition } from "@/lib/services";
import { ServiceIcon } from "@/components/ServiceIcon";
import { useStore } from "@/lib/store";
import type { ViewGroup } from "@/types/electron-api";

interface DockProps {
  revealed: boolean;
  expanded: boolean;
  width: number;
  loadingServiceIds: Set<string>;
  onOpenSettings: () => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}

export function Dock({
  revealed,
  expanded,
  width,
  loadingServiceIds,
  onOpenSettings,
  onMouseEnter,
  onMouseLeave,
}: DockProps) {
  const { state, update } = useStore();
  const draggedGroupIdRef = useRef<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);

  const groups = state.layout.groups;
  const activeGroup = groups.find((g) => g.id === state.layout.activeGroupId);

  function groupOrder(group: ViewGroup) {
    return Math.min(
      ...group.serviceIds.map((id) => state.services.find((s) => s.id === id)?.order ?? Infinity),
    );
  }

  const orderedGroups = [...groups].sort((a, b) => groupOrder(a) - groupOrder(b));

  function activateGroup(id: string) {
    update({ layout: { ...state.layout, activeGroupId: id } });
  }

  function mergeGroups(draggedId: string, targetId: string) {
    if (draggedId === targetId) return;
    const dragged = groups.find((g) => g.id === draggedId);
    const target = groups.find((g) => g.id === targetId);
    if (!dragged || !target) return;

    const mergedServiceIds = [...target.serviceIds, ...dragged.serviceIds].filter(
      (id, index, arr) => arr.indexOf(id) === index,
    );
    const nextGroups = groups
      .filter((g) => g.id !== draggedId)
      .map((g) => (g.id === targetId ? { ...g, serviceIds: mergedServiceIds } : g));

    update({ layout: { ...state.layout, groups: nextGroups, activeGroupId: targetId } });
  }

  function ungroupAll(groupId: string) {
    const group = groups.find((g) => g.id === groupId);
    if (!group || group.serviceIds.length < 2) return;

    const soloGroups: ViewGroup[] = group.serviceIds.map((id) => ({
      id,
      serviceIds: [id],
      splitDirection: "horizontal",
      splitSizes: {},
    }));
    const nextGroups = groups.flatMap((g) => (g.id === groupId ? soloGroups : [g]));

    update({ layout: { ...state.layout, groups: nextGroups, activeGroupId: soloGroups[0].id } });
  }

  function toggleSplitDirection() {
    if (!activeGroup) return;
    const nextGroups = groups.map((g) =>
      g.id === activeGroup.id
        ? {
            ...g,
            splitDirection: (g.splitDirection === "horizontal" ? "vertical" : "horizontal") as
              | "horizontal"
              | "vertical",
          }
        : g,
    );
    update({ layout: { ...state.layout, groups: nextGroups } });
  }

  function handleDragStart(id: string) {
    draggedGroupIdRef.current = id;
  }

  function handleDragOver(id: string, e: DragEvent<HTMLElement>) {
    e.preventDefault();
    if (draggedGroupIdRef.current && draggedGroupIdRef.current !== id) setDropTargetId(id);
  }

  function handleDrop(id: string, e: DragEvent<HTMLElement>) {
    e.preventDefault();
    if (draggedGroupIdRef.current) mergeGroups(draggedGroupIdRef.current, id);
    draggedGroupIdRef.current = null;
    setDropTargetId(null);
  }

  function handleDragEnd() {
    draggedGroupIdRef.current = null;
    setDropTargetId(null);
  }

  return (
    <motion.nav
      initial={false}
      animate={{ x: revealed ? 0 : -width, width }}
      transition={{ type: "spring", stiffness: 420, damping: 38 }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      className={`fixed inset-y-0 left-0 z-40 flex h-full flex-col gap-2 overflow-hidden border-r border-base-300 bg-base-200 py-4 shadow-xl ${
        expanded ? "items-stretch px-2" : "items-center"
      }`}
    >
      <ul className={`flex flex-1 flex-col gap-2 ${expanded ? "" : "items-center"}`}>
        {orderedGroups.map((group) => (
          <li key={group.id}>
            <GroupButton
              group={group}
              expanded={expanded}
              isActive={group.id === state.layout.activeGroupId}
              isDropTarget={dropTargetId === group.id}
              isLoading={group.serviceIds.some((id) => loadingServiceIds.has(id))}
              onClick={() => activateGroup(group.id)}
              onDragStart={() => handleDragStart(group.id)}
              onDragOver={(e) => handleDragOver(group.id, e)}
              onDragLeave={() => setDropTargetId((cur) => (cur === group.id ? null : cur))}
              onDrop={(e) => handleDrop(group.id, e)}
              onDragEnd={handleDragEnd}
              onUngroup={() => ungroupAll(group.id)}
            />
          </li>
        ))}
      </ul>

      {activeGroup && activeGroup.serviceIds.length > 1 && (
        <DockAction
          expanded={expanded}
          title="Dirección del split"
          label="Dirección del split"
          onClick={toggleSplitDirection}
          icon={
            activeGroup.splitDirection === "horizontal" ? (
              <SplitSquareHorizontal size={20} />
            ) : (
              <SplitSquareVertical size={20} />
            )
          }
        />
      )}

      <DockAction
        expanded={expanded}
        title="Configuración"
        label="Configuración"
        onClick={onOpenSettings}
        icon={
          // Relative path (not next/image, which rejects relative src
          // strings) — a root-absolute "/app-icon.png" 404s under the
          // packaged app's file:// load. See notification/page.tsx for the
          // full explanation.
          // eslint-disable-next-line @next/next/no-img-element
          <img src="app-icon.png" alt="" width={22} height={22} className="shrink-0 rounded-md" />
        }
      />
    </motion.nav>
  );
}

interface DockActionProps {
  expanded: boolean;
  title: string;
  label: string;
  icon: ReactNode;
  onClick: () => void;
}

function DockAction({ expanded, title, label, icon, onClick }: DockActionProps) {
  return (
    <motion.button
      type="button"
      title={title}
      onClick={onClick}
      whileTap={{ scale: 0.96 }}
      whileHover={{ scale: expanded ? 1 : 1.06 }}
      className={`flex cursor-pointer items-center gap-3 rounded-xl text-base-content/70 hover:bg-base-300 ${
        expanded ? "h-10 w-full px-3" : "h-11 w-11 justify-center"
      }`}
    >
      {icon}
      {expanded && <span className="truncate text-sm">{label}</span>}
    </motion.button>
  );
}

interface GroupButtonProps {
  group: ViewGroup;
  expanded: boolean;
  isActive: boolean;
  isDropTarget: boolean;
  isLoading: boolean;
  onClick: () => void;
  onDragStart: () => void;
  onDragOver: (e: DragEvent<HTMLButtonElement>) => void;
  onDragLeave: () => void;
  onDrop: (e: DragEvent<HTMLButtonElement>) => void;
  onDragEnd: () => void;
  onUngroup: () => void;
}

function GroupButton({
  group,
  expanded,
  isActive,
  isDropTarget,
  isLoading,
  onClick,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragEnd,
  onUngroup,
}: GroupButtonProps) {
  const services = group.serviceIds
    .map((id) => getServiceDefinition(id))
    .filter((s): s is NonNullable<typeof s> => Boolean(s));
  if (services.length === 0) return null;

  const isGroup = services.length > 1;
  const label = services.map((s) => s.name).join(" + ");
  const title = isGroup ? `${label} (click para separar)` : label;

  const icon = isGroup ? (
    <span className="grid shrink-0 grid-cols-2 gap-0.5">
      {services.slice(0, 4).map((service) => (
        <ServiceIcon key={service.id} service={service} size={12} />
      ))}
    </span>
  ) : (
    <ServiceIcon service={services[0]} size={20} className="shrink-0" />
  );

  // daisyUI's `aura` utility (https://daisyui.com/components/aura/): a
  // rotating conic-gradient ring in `currentColor`, drawn as the wrapper's
  // own background with the child covering everything but a thin padding
  // strip — so the child needs an opaque background or the gradient shows
  // through the whole button instead of just framing it. Tinted per-button
  // with the service's own brand color, per request.
  const auraColor = services[0].color;

  const button = (
    <motion.button
      type="button"
      title={title}
      draggable
      onClick={onClick}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      whileTap={{ scale: 0.96 }}
      whileHover={{ scale: expanded ? 1 : 1.06 }}
      className={`flex cursor-pointer items-center gap-3 rounded-xl transition-colors ${
        expanded ? "h-10 w-full px-3" : "h-11 w-11 justify-center"
      } ${
        isActive
          ? "bg-primary text-primary-content"
          : `text-base-content/70 hover:bg-base-300 ${isLoading ? "bg-base-200" : ""}`
      } ${isDropTarget ? "ring-2 ring-primary ring-offset-2 ring-offset-base-200" : ""}`}
    >
      {icon}
      {expanded && <span className="truncate text-sm">{label}</span>}
    </motion.button>
  );

  return (
    <div className="relative">
      {/* Always mounted with the same `aura` padding reserved, loading or
          not — toggling the wrapper in/out of the tree shifts every button
          below it by the aura's padding, which read as the whole dock
          jumping each time a page started/finished loading. Instead the
          padding stays constant and only `color` (the gradient's
          currentColor source) toggles transparent, so nothing ever
          reflows. */}
      <span
        className="aura aura-sm block rounded-xl"
        style={
          {
            color: isLoading ? auraColor : "transparent",
            animationPlayState: isLoading ? "running" : "paused",
            "--aura-radius": "0.75rem",
          } as CSSProperties
        }
      >
        {button}
      </span>

      {isGroup && (
        <button
          type="button"
          title="Separar grupo"
          onClick={(e) => {
            e.stopPropagation();
            onUngroup();
          }}
          className={`absolute flex h-4 w-4 cursor-pointer items-center justify-center rounded-full bg-base-100 text-base-content/60 shadow ring-1 ring-base-300 hover:bg-error hover:text-error-content ${
            expanded ? "right-1 top-1/2 -translate-y-1/2" : "-right-1 -top-1"
          }`}
        >
          <X size={10} />
        </button>
      )}
    </div>
  );
}
