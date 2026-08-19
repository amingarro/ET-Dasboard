"use client";

import { Bell, BellOff, GripVertical, X } from "lucide-react";
import { motion } from "motion/react";
import { SERVICE_DEFINITIONS, getServiceDefinition } from "@/lib/services";
import { ServiceIcon } from "@/components/ServiceIcon";
import { useDragReorder } from "@/lib/useDragReorder";
import { useStore } from "@/lib/store";
import type { DockMode, ServiceConfig, StoreSchema } from "@/types/electron-api";

const DUMMY_NOTIFICATIONS = [
  { title: "Nuevo mensaje", body: "Tenés un mensaje nuevo sin leer en la bandeja de entrada." },
  { title: "Te mencionaron", body: "Alguien te mencionó en un comentario." },
  { title: "Recordatorio", body: "Una tarjeta vence hoy — no te olvides de revisarla." },
];

interface SettingsProps {
  onClose: () => void;
}

export function Settings({ onClose }: SettingsProps) {
  const { state, update } = useStore();

  function sendDummyNotification() {
    const enabledIds = state.services.filter((s) => s.enabled).map((s) => s.id);
    const serviceId = enabledIds[Math.floor(Math.random() * enabledIds.length)] ?? "gmail";
    const sample = DUMMY_NOTIFICATIONS[Math.floor(Math.random() * DUMMY_NOTIFICATIONS.length)];
    window.electronAPI.showNotification({ serviceId, ...sample });
  }

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
        : { id, enabled: false, order: index, notificationsEnabled: true };
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
      services = [
        ...state.services,
        { id, enabled: true, order: state.services.length, notificationsEnabled: true },
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

  const themeOptions: { value: StoreSchema["theme"]; label: string }[] = [
    { value: "light", label: "Claro" },
    { value: "dark", label: "Oscuro" },
    { value: "system", label: "Sistema" },
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
            <p className="text-sm text-base-content/70">Tema</p>
            <div className="join">
              {themeOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={`btn join-item btn-sm ${
                    state.theme === option.value ? "btn-primary" : "btn-ghost"
                  }`}
                  onClick={() => update({ theme: option.value })}
                >
                  {option.label}
                </button>
              ))}
            </div>
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

          <div className="flex flex-col gap-2">
            <p className="text-sm text-base-content/70">Notificaciones</p>
            <button
              type="button"
              className="btn btn-outline btn-sm w-fit gap-2"
              onClick={sendDummyNotification}
            >
              <Bell size={16} />
              Probar notificación
            </button>
          </div>

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
                <li key={service.id} {...dragProps} className={isDragging ? "opacity-40" : undefined}>
                  <div
                    className={`flex w-full items-center gap-1 rounded-lg border pr-2 transition-colors ${
                      isEnabled
                        ? "border-primary bg-primary/10"
                        : "border-base-300 hover:bg-base-200"
                    }`}
                  >
                    <label
                      className={`flex flex-1 items-center gap-1 py-1 ${
                        isLastEnabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"
                      }`}
                    >
                      <span className="cursor-grab p-2 text-base-content/40 active:cursor-grabbing">
                        <GripVertical size={16} />
                      </span>
                      <ServiceIcon service={service} size={20} className="shrink-0" />
                      <span className="flex-1 py-2 font-medium">{service.name}</span>
                      <input
                        type="checkbox"
                        className="toggle toggle-primary"
                        checked={isEnabled}
                        disabled={isLastEnabled}
                        onChange={() => toggleService(service.id)}
                      />
                    </label>
                    <button
                      type="button"
                      title={
                        notificationsEnabled
                          ? `Apagar notificaciones de ${service.name}`
                          : `Prender notificaciones de ${service.name}`
                      }
                      onClick={() => toggleNotifications(service.id)}
                      className={`rounded-lg p-2 hover:bg-base-300 ${
                        notificationsEnabled ? "text-base-content/70" : "text-base-content/30"
                      }`}
                    >
                      {notificationsEnabled ? <Bell size={16} /> : <BellOff size={16} />}
                    </button>
                  </div>
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
                      return (
                        <span
                          key={id}
                          className="badge badge-outline gap-1 py-3"
                        >
                          <ServiceIcon service={service} size={14} />
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
