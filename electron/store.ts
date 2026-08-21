import { defaultServices } from "./services";

export interface ServiceConfig {
  id: string;
  enabled: boolean;
  order: number;
  notificationsEnabled: boolean;
}

export interface ViewGroup {
  id: string;
  serviceIds: string[];
  splitDirection: "horizontal" | "vertical";
  splitSizes: Record<string, number>;
}

export interface LayoutState {
  groups: ViewGroup[];
  activeGroupId: string | null;
}

export type DockMode = "expanded" | "compact" | "auto";

export interface StoreSchema {
  onboarded: boolean;
  theme: "light" | "dark" | "system";
  dockMode: DockMode;
  services: ServiceConfig[];
  layout: LayoutState;
  driveSyncEnabled: boolean;
}

function soloGroup(serviceId: string): ViewGroup {
  return { id: serviceId, serviceIds: [serviceId], splitDirection: "horizontal", splitSizes: {} };
}

const defaultStoreValues: StoreSchema = {
  onboarded: false,
  theme: "system",
  dockMode: "expanded",
  services: defaultServices.map((service, index) => ({
    id: service.id,
    enabled: true,
    order: index,
    notificationsEnabled: true,
  })),
  layout: {
    groups: defaultServices.map((service) => soloGroup(service.id)),
    activeGroupId: defaultServices[0]?.id ?? null,
  },
  driveSyncEnabled: false,
};

export interface AppStore {
  readonly store: StoreSchema;
  set(patch: Partial<StoreSchema>): void;
  onDidAnyChange(callback: (newValue: StoreSchema | undefined) => void): void;
}

let storeInstance: AppStore | null = null;

// Shape used by every layout schema this app has ever persisted, so the
// migration below can detect and convert old data regardless of version.
interface LegacyLayoutState {
  mode?: "fullscreen" | "split";
  activeServiceId?: string | null;
  splitServiceIds?: string[];
  splitDirection?: "horizontal" | "vertical";
  splitSizes?: Record<string, number>;
  groups?: ViewGroup[];
  activeGroupId?: string | null;
}

function migrateLayout(services: ServiceConfig[], layout: LegacyLayoutState | undefined): LayoutState {
  if (layout?.groups) {
    // Already on the groups-based schema; just backfill anything a future
    // field addition might be missing (electron-store doesn't deep-merge).
    return {
      groups: layout.groups.map((g) => ({
        ...g,
        splitDirection: g.splitDirection ?? "horizontal",
        splitSizes: g.splitSizes ?? {},
      })),
      activeGroupId: layout.activeGroupId ?? layout.groups[0]?.id ?? null,
    };
  }

  const enabledIds = services.filter((s) => s.enabled).sort((a, b) => a.order - b.order).map((s) => s.id);

  if (!layout) {
    return {
      groups: enabledIds.map(soloGroup),
      activeGroupId: enabledIds[0] ?? null,
    };
  }

  // Legacy single-mode schema: fold the old split group (if any) into one
  // ViewGroup, everything else becomes its own solo group.
  const splitIds = layout.splitServiceIds ?? [];
  const groups: ViewGroup[] = [];
  if (splitIds.length >= 2) {
    groups.push({
      id: "merged",
      serviceIds: splitIds,
      splitDirection: layout.splitDirection ?? "horizontal",
      splitSizes: layout.splitSizes ?? {},
    });
  }
  for (const id of enabledIds) {
    if (splitIds.includes(id)) continue;
    groups.push(soloGroup(id));
  }

  const activeGroupId =
    layout.mode === "split" && splitIds.length >= 2
      ? "merged"
      : (layout.activeServiceId ?? enabledIds[0] ?? null);

  return { groups, activeGroupId: activeGroupId ?? groups[0]?.id ?? null };
}

export async function getStore(): Promise<AppStore> {
  if (!storeInstance) {
    const { default: Store } = await import("electron-store");
    storeInstance = new Store({
      defaults: defaultStoreValues,
    }) as unknown as AppStore;

    const current = storeInstance.store;
    const migrated = migrateLayout(current.services, current.layout as unknown as LegacyLayoutState);
    if (JSON.stringify(migrated) !== JSON.stringify(current.layout)) {
      storeInstance.set({ layout: migrated });
    }
    if (!current.dockMode) {
      storeInstance.set({ dockMode: "expanded" });
    }
    if (current.driveSyncEnabled === undefined) {
      storeInstance.set({ driveSyncEnabled: false });
    }

    // electron-store doesn't backfill missing fields on objects already
    // persisted inside an array, so services saved before notificationsEnabled
    // existed load without it.
    const migratedServices = current.services.map((s) => ({
      ...s,
      notificationsEnabled: s.notificationsEnabled ?? true,
    }));
    if (JSON.stringify(migratedServices) !== JSON.stringify(current.services)) {
      storeInstance.set({ services: migratedServices });
    }
  }
  return storeInstance;
}
