"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { SERVICE_DEFINITIONS, getServiceDefinition, soloGroup } from "@/lib/services";
import { ServiceListItem } from "@/components/ServiceListItem";
import { SegmentedControl } from "@/components/SegmentedControl";
import { useDragReorder } from "@/lib/useDragReorder";
import { useStore } from "@/lib/store";
import type { StoreSchema } from "@/types/electron-api";

const themeOptions: { value: StoreSchema["theme"]; label: string }[] = [
  { value: "light", label: "Claro" },
  { value: "dark", label: "Oscuro" },
  { value: "system", label: "Sistema" },
];

export function Onboarding() {
  const { update } = useStore();
  const [enabled, setEnabled] = useState<Set<string>>(
    new Set(SERVICE_DEFINITIONS.map((service) => service.id)),
  );
  const [order, setOrder] = useState<string[]>(
    SERVICE_DEFINITIONS.map((service) => service.id),
  );
  const [theme, setTheme] = useState<StoreSchema["theme"]>("system");
  const { getItemProps } = useDragReorder(order, setOrder);

  function toggleService(id: string) {
    setEnabled((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function handleStart() {
    const services = order.map((id, index) => ({
      id,
      enabled: enabled.has(id),
      order: index,
      notificationsEnabled: true,
      lastUrl: null,
    }));
    const enabledIds = order.filter((id) => enabled.has(id));

    update({
      onboarded: true,
      theme,
      services,
      layout: {
        groups: enabledIds.map((id) => soloGroup(id)),
        activeGroupId: enabledIds[0] ?? null,
      },
    });
  }

  const noneSelected = enabled.size === 0;

  return (
    <div className="flex h-screen w-screen items-center justify-center bg-base-200 p-8">
      <div className="card w-full max-w-lg bg-base-100 shadow-xl">
        <div className="card-body gap-6">
          <div>
            <h1 className="text-2xl font-bold">Bienvenido a ET Dashboard</h1>
            <p className="text-base-content/70">
              Elegí qué servicios querés tener siempre a mano en una sola ventana.
            </p>
          </div>

          <ul className="flex flex-col gap-2">
            {order.map((id) => {
              const service = getServiceDefinition(id);
              if (!service) return null;
              const isEnabled = enabled.has(service.id);
              const { isDragging, ...dragProps } = getItemProps(service.id);
              return (
                <ServiceListItem
                  key={service.id}
                  service={service}
                  highlighted={isEnabled}
                  isDragging={isDragging}
                  dragProps={dragProps}
                  variant="select"
                  onMainClick={() => toggleService(service.id)}
                  right={isEnabled && <Check size={18} className="text-primary" />}
                />
              );
            })}
          </ul>

          <div>
            <p className="mb-2 text-sm font-medium text-base-content/70">Tema</p>
            <SegmentedControl options={themeOptions} value={theme} onChange={setTheme} />
          </div>

          <button
            type="button"
            className="btn btn-primary"
            disabled={noneSelected}
            onClick={handleStart}
          >
            Comenzar
          </button>
        </div>
      </div>
    </div>
  );
}
