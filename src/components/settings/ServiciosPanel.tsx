"use client";

import { Bell, BellOff, X } from "lucide-react";
import { SERVICE_DEFINITIONS, getServiceDefinition, soloGroup } from "@/lib/services";
import { ServiceIcon } from "@/components/ServiceIcon";
import { ServiceListItem } from "@/components/ServiceListItem";
import { useDragReorder } from "@/lib/useDragReorder";
import { useStore } from "@/lib/store";
import type { ServiceConfig } from "@/types/electron-api";

export function ServiciosPanel() {
  const { state, update } = useStore();

  const orderedIds = [...SERVICE_DEFINITIONS.map((s) => s.id)].sort((a, b) => {
    const orderA = state.services.find((s) => s.id === a)?.order ?? 0;
    const orderB = state.services.find((s) => s.id === b)?.order ?? 0;
    return orderA - orderB;
  });

  function reorder(nextIds: string[]) {
    const services = nextIds.map((id, index) => {
      const existing = state.services.find((s) => s.id === id);
      return existing
        ? { ...existing, order: index }
        : { id, enabled: false, order: index, notificationsEnabled: true, lastUrl: null };
    });
    update({ services });
  }

  const { getItemProps } = useDragReorder(orderedIds, reorder);

  const enabledCount = state.services.filter((s) => s.enabled).length;
  const multiGroups = state.layout.groups.filter((g) => g.serviceIds.length > 1);

  function toggleService(id: string) {
    const existing = state.services.find((s) => s.id === id);
    const isCurrentlyEnabled = existing?.enabled ?? false;

    if (isCurrentlyEnabled && enabledCount <= 1) return;

    let services: ServiceConfig[];
    if (existing) {
      services = state.services.map((s) => (s.id === id ? { ...s, enabled: !s.enabled } : s));
    } else {
      services = [
        ...state.services,
        { id, enabled: true, order: state.services.length, notificationsEnabled: true, lastUrl: null },
      ];
    }

    let groups = state.layout.groups;
    if (isCurrentlyEnabled) {
      // Disabling: drop it from whichever group holds it; empty groups die too.
      groups = groups
        .map((g) => ({ ...g, serviceIds: g.serviceIds.filter((s) => s !== id) }))
        .filter((g) => g.serviceIds.length > 0);
    } else if (!groups.some((g) => g.serviceIds.includes(id))) {
      // Enabling a service with no group yet: give it its own solo group.
      groups = [...groups, soloGroup(id)];
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

  function toggleNotifications(id: string) {
    const services = state.services.map((s) =>
      s.id === id ? { ...s, notificationsEnabled: !(s.notificationsEnabled ?? true) } : s,
    );
    update({ services });
  }

  function removeFromGroup(groupId: string, serviceId: string) {
    const group = state.layout.groups.find((g) => g.id === groupId);
    if (!group || group.serviceIds.length < 2) return;

    const trimmedGroup = { ...group, serviceIds: group.serviceIds.filter((s) => s !== serviceId) };
    const groups = state.layout.groups.map((g) => (g.id === groupId ? trimmedGroup : g));
    groups.splice(groups.indexOf(trimmedGroup) + 1, 0, soloGroup(serviceId));

    update({ layout: { ...state.layout, groups } });
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-base-content/70">
        Elegí qué páginas querés tener disponibles en el dock.
      </p>

      <ul className="flex flex-col gap-2">
        {orderedIds.map((id) => {
          const service = getServiceDefinition(id);
          if (!service) return null;
          const config = state.services.find((s) => s.id === service.id);
          const isEnabled = config?.enabled ?? false;
          const notificationsEnabled = config?.notificationsEnabled ?? true;
          const isLastEnabled = isEnabled && enabledCount <= 1;
          const { isDragging, ...dragProps } = getItemProps(service.id);
          return (
            <ServiceListItem
              key={service.id}
              service={service}
              highlighted={isEnabled}
              isDragging={isDragging}
              dragProps={dragProps}
              variant="toggle"
              disabled={isLastEnabled}
              right={
                <input
                  type="checkbox"
                  className="toggle toggle-primary"
                  checked={isEnabled}
                  disabled={isLastEnabled}
                  onChange={() => toggleService(service.id)}
                />
              }
              after={
                <button
                  type="button"
                  title={
                    notificationsEnabled
                      ? `Apagar notificaciones de ${service.name}`
                      : `Prender notificaciones de ${service.name}`
                  }
                  onClick={() => toggleNotifications(service.id)}
                  className={`cursor-pointer rounded-lg p-2 hover:bg-base-300 ${
                    notificationsEnabled ? "text-base-content/70" : "text-base-content/30"
                  }`}
                >
                  {notificationsEnabled ? <Bell size={16} /> : <BellOff size={16} />}
                </button>
              }
            />
          );
        })}
      </ul>

      {multiGroups.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-base-content/50">
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
                  return (
                    <span key={id} className="badge badge-outline gap-1 py-3">
                      <ServiceIcon service={service} size={14} />
                      {service.name}
                      <button
                        type="button"
                        title={`Sacar ${service.name} del grupo`}
                        onClick={() => removeFromGroup(group.id, id)}
                        className="ml-1 cursor-pointer text-base-content/50 hover:text-base-content"
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
  );
}
