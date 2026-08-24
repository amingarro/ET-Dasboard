"use client";

import { useState } from "react";
import { Check, GripVertical } from "lucide-react";
import { SERVICE_DEFINITIONS, getServiceDefinition } from "@/lib/services";
import { ServiceIcon } from "@/components/ServiceIcon";
import { useDragReorder } from "@/lib/useDragReorder";
import { useStore } from "@/lib/store";
import type { StoreSchema } from "@/types/electron-api";

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
        groups: enabledIds.map((id) => ({
          id,
          serviceIds: [id],
          splitDirection: "horizontal" as const,
          splitSizes: {},
        })),
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
                <li
                  key={service.id}
                  {...dragProps}
                  className={isDragging ? "opacity-40" : undefined}
                >
                  <div
                    className={`flex w-full items-center gap-1 rounded-lg border px-2 py-1 text-left transition-colors ${
                      isEnabled
                        ? "border-primary bg-primary/10"
                        : "border-base-300 hover:bg-base-200"
                    }`}
                  >
                    <span className="cursor-grab p-2 text-base-content/40 active:cursor-grabbing">
                      <GripVertical size={16} />
                    </span>
                    <button
                      type="button"
                      onClick={() => toggleService(service.id)}
                      className="flex flex-1 items-center gap-3 py-2 text-left"
                    >
                      <ServiceIcon service={service} size={20} className="shrink-0" />
                      <span className="flex-1 font-medium">{service.name}</span>
                      {isEnabled && <Check size={18} className="text-primary" />}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>

          <div>
            <p className="mb-2 text-sm font-medium text-base-content/70">Tema</p>
            <div className="join">
              {(["light", "dark", "system"] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  className={`btn join-item btn-sm ${
                    theme === option ? "btn-primary" : "btn-ghost"
                  }`}
                  onClick={() => setTheme(option)}
                >
                  {option === "light" ? "Claro" : option === "dark" ? "Oscuro" : "Sistema"}
                </button>
              ))}
            </div>
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
