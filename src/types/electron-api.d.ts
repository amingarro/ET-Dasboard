export interface ServiceConfig {
  id: string;
  enabled: boolean;
  order: number;
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
}

declare global {
  interface Window {
    electronAPI: {
      platform: string;
      store: {
        getAll: () => Promise<StoreSchema>;
        set: (patch: Partial<StoreSchema>) => Promise<StoreSchema>;
        onChange: (callback: (value: StoreSchema) => void) => () => void;
      };
    };
  }
}
