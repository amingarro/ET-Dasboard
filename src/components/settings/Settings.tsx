"use client";

import { GripVertical, X } from "lucide-react";
import { motion } from "motion/react";
import { SERVICE_DEFINITIONS, getServiceDefinition } from "@/lib/services";
import { useDragReorder } from "@/lib/useDragReorder";
import { useStore } from "@/lib/store";
import type { DockMode, ServiceConfig } from "@/types/electron-api";

interface SettingsProps {
  onClose: () => void;
}

export function Settings({ onClose }: SettingsProps) {
  const { state, update } = useStore();

  const orderedIds = [...SERVICE_DEFINITIONS.map((s) => s.id)].sort((a, b) => {
    const orderA = state.services.find((s) => s.id === a)?.order ?? 0;
    const orderB = state.services.find((s) => s.id === b)?.order ?? 0;
    return orderA - orderB;
  });

  function reorder(nextIds: string[]) {
    const services = nextIds.map((id, index) => {
      const existing = state.services.find((s) => s.id === id);
      return existing ? { ...existing, order: index } : { id, enabled: false, order: index };
    });
    update({ services });
  }

  const { getItemProps } = useDragReorder(orderedIds, reorder);

  function toggleService(id: string) {
    const existing = state.services.find((s) => s.id === id);
    const isCurrentlyEnabled = existing?.enabled ?? false;
    const enabledCount = state.services.filter((s) => s.enabled).length;

    if (isCurrentlyEnabled && enabledCount <= 1) return;

    let services: ServiceConfig[];
    if (existing) {
      services = state.services.map((s) =>
        s.id === id ? { ...s, enabled: !s.enabled } : s,
      );
    } else {
      services = [...state.services, { id, enabled: true, order: state.services.length }];
    }

    let groups = state.layout.groups;
    if (isCurrentlyEnabled) {
      // Disabling: drop it from whichever group holds it; empty groups die too.
      groups = groups
        .map((g) => ({ ...g, serviceIds: g.serviceIds.filter((s) => s !== id) }))
        .filter((g) => g.serviceIds.length > 0);
    } else if (!groups.some((g) => g.serviceIds.includes(id))) {
      // Enabling a service with no group yet: give it its own solo group.
      groups = [...groups, { id, serviceIds: [id], splitDirection: "horizontal", splitSizes: {} }];
    }

    const activeStillExists = groups.some((g) => g.id === state.layout.activeGroupId);

    update({
      services,
      layout: {
        groups,
        activeGroupId: activeStillExists ? state.layout.activeGroupId : (groups[0]?.id ?? null),
      },
    });
  }

  function removeFromGroup(groupId: string, serviceId: string) {
    const group = state.layout.groups.find((g) => g.id === groupId);
    if (!group || group.serviceIds.length < 2) return;

    const trimmedGroup = { ...group, serviceIds: group.serviceIds.filter((s) => s !== serviceId) };
    const soloGroup = {
      id: serviceId,
      serviceIds: [serviceId],
      splitDirection: "horizontal" as const,
      splitSizes: {},
    };
    const groups = state.layout.groups.map((g) => (g.id === groupId ? trimmedGroup : g));
    groups.splice(groups.indexOf(trimmedGroup) + 1, 0, soloGroup);

    update({ layout: { ...state.layout, groups } });
  }

  const enabledCount = state.services.filter((s) => s.enabled).length;
  const multiGroups = state.layout.groups.filter((g) => g.serviceIds.length > 1);

  const dockModeOptions: { value: DockMode; label: string }[] = [
    { value: "expanded", label: "Ícono y texto" },
    { value: "compact", label: "Ícono solo" },
    { value: "auto", label: "Automático" },
  ];

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-8"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className="card w-full max-w-lg bg-base-100 shadow-xl"
        initial={{ opacity: 0, scale: 0.96, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 8 }}
        transition={{ type: "spring", stiffness: 400, damping: 32 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="card-body gap-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold">Configuración</h2>
            <button
              type="button"
              className="btn btn-ghost btn-sm btn-circle"
              onClick={onClose}
            >
              <X size={18} />
            </button>
          </div>
          <div className="flex flex-col gap-2">
            <p className="text-sm text-base-content/70">Menú lateral</p>
            <div className="join">
              {dockModeOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={`btn join-item btn-sm ${
                    state.dockMode === option.value ? "btn-primary" : "btn-ghost"
                  }`}
                  onClick={() => update({ dockMode: option.value })}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <p className="text-xs text-base-content/50">
              &quot;Ícono y texto&quot; y &quot;Ícono solo&quot; lo dejan siempre visible.
              &quot;Automático&quot; lo oculta y aparece al acercar el mouse al borde.
            </p>
          </div>

          <p className="text-sm text-base-content/70">
            Elegí qué páginas querés tener disponibles en el dock.
          </p>

          <ul className="flex flex-col gap-2">
            {orderedIds.map((id) => {
              const service = getServiceDefinition(id);
              if (!service) return null;
              const Icon = service.icon;
              const isEnabled =
                state.services.find((s) => s.id === service.id)?.enabled ?? false;
              const isLastEnabled = isEnabled && enabledCount <= 1;
              const { isDragging, ...dragProps } = getItemProps(service.id);
              return (
                <li key={service.id} {...dragProps} className={isDragging ? "opacity-40" : undefined}>
                  <label
                    className={`flex w-full items-center gap-1 rounded-lg border pr-4 transition-colors ${
                      isLastEnabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"
                    } ${
                      isEnabled
                        ? "border-primary bg-primary/10"
                        : "border-base-300 hover:bg-base-200"
                    }`}
                  >
                    <span className="cursor-grab p-2 text-base-content/40 active:cursor-grabbing">
                      <GripVertical size={16} />
                    </span>
                    <Icon size={20} color={service.color} className="shrink-0" />
                    <span className="flex-1 py-3 font-medium">{service.name}</span>
                    <input
                      type="checkbox"
                      className="toggle toggle-primary"
                      checked={isEnabled}
                      disabled={isLastEnabled}
                      onChange={() => toggleService(service.id)}
                    />
                  </label>
                </li>
              );
            })}
          </ul>

          {multiGroups.length > 0 && (
            <div className="flex flex-col gap-2">
              <p className="text-sm text-base-content/70">
                Grupos armados (arrastrá un ícono sobre otro en el dock para crear uno nuevo):
              </p>
              <ul className="flex flex-col gap-2">
                {multiGroups.map((group) => (
                  <li
                    key={group.id}
                    className="flex flex-wrap items-center gap-2 rounded-lg border border-base-300 px-3 py-2"
                  >
                    {group.serviceIds.map((id) => {
                      const service = getServiceDefinition(id);
                      if (!service) return null;
                      const Icon = service.icon;
                      return (
                        <span
                          key={id}
                          className="badge badge-outline gap-1 py-3"
                        >
                          <Icon size={14} color={service.color} />
                          {service.name}
                          <button
                            type="button"
                            title={`Sacar ${service.name} del grupo`}
                            onClick={() => removeFromGroup(group.id, id)}
                            className="ml-1 text-base-content/50 hover:text-base-content"
                          >
                            <X size={12} />
                          </button>
                        </span>
                      );
                    })}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <p className="text-xs text-base-content/50">
            Tiene que quedar al menos una página activa. Los cambios se guardan al instante.
          </p>
        </div>
      </motion.div>
    </motion.div>
  );
}
