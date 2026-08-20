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

export interface NotificationPayload {
  serviceId: string;
  title: string;
  body: string;
}

export interface UpdateCheckResult {
  currentVersion: string;
  latestVersion: string | null;
  updateAvailable: boolean;
  releaseUrl: string | null;
  error: string | null;
}

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
      getWebviewPreloadPath: () => Promise<string>;
      showNotification: (payload: NotificationPayload) => void;
      onNotificationClick: (callback: (serviceId: string) => void) => () => void;
      onNotificationData: (callback: (payload: NotificationPayload) => void) => () => void;
      activateNotificationService: (serviceId: string) => void;
      closeNotificationPopup: () => void;
      checkForUpdates: () => Promise<UpdateCheckResult>;
      openExternal: (url: string) => void;
      store: {
        getAll: () => Promise<StoreSchema>;
        set: (patch: Partial<StoreSchema>) => Promise<StoreSchema>;
        onChange: (callback: (value: StoreSchema) => void) => () => void;
      };
    };
  }
}
