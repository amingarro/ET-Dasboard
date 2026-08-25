export interface ServiceConfig {
  id: string;
  enabled: boolean;
  order: number;
  notificationsEnabled: boolean;
  lastUrl: string | null;
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
  driveSyncEnabled: boolean;
  birthdayNotificationsEnabled: boolean;
}

// Notes are NOT part of StoreSchema/electron-store — each note is its own
// JSON file on disk, read/written via the separate notes:* IPC channel
// below. See electron/notesStore.ts for the main-process side.
export type NoteType = "normal" | "todo";

export interface NoteChecklistItem {
  id: string;
  text: string;
  done: boolean;
}

export interface Note {
  id: string;
  title: string;
  type: NoteType;
  color: string;
  pinned: boolean;
  bodyHtml: string;
  checklist: NoteChecklistItem[];
  deadline: string | null;
  createdAt: number;
  updatedAt: number;
}

// Same deal as Note above: a flat JSON file, not part of StoreSchema — see
// electron/birthdaysStore.ts.
export interface Birthday {
  id: string;
  name: string;
  date: string; // "YYYY-MM-DD"
}

export interface SyncStatus {
  phase: "auth" | "waiting" | "uploading" | "done" | "error";
  message: string;
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
      downloadUpdate: () => Promise<{ error: string | null }>;
      relaunchApp: () => void;
      onUpdateDownloadProgress: (callback: (percent: number) => void) => () => void;
      onUpdateInstalled: (callback: () => void) => () => void;
      onUpdateError: (callback: (message: string) => void) => () => void;
      store: {
        getAll: () => Promise<StoreSchema>;
        set: (patch: Partial<StoreSchema>) => Promise<StoreSchema>;
        onChange: (callback: (value: StoreSchema) => void) => () => void;
      };
      notes: {
        list: () => Promise<Note[]>;
        save: (note: Note) => Promise<void>;
        delete: (id: string) => Promise<void>;
      };
      birthdays: {
        list: () => Promise<Birthday[]>;
        save: (birthday: Birthday) => Promise<Birthday[]>;
        delete: (id: string) => Promise<Birthday[]>;
      };
      drive: {
        sync: () => Promise<{ ok: boolean; uploaded?: number; error?: string }>;
        onSyncStatus: (callback: (status: SyncStatus) => void) => () => void;
      };
    };
  }
}
