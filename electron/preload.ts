import { contextBridge, ipcRenderer } from "electron";
import type { Note } from "./notesStore";
import type { Birthday } from "./birthdaysStore";
import type { SyncStatus } from "./driveSync";

interface NotificationPayload {
  serviceId: string;
  title: string;
  body: string;
}

contextBridge.exposeInMainWorld("electronAPI", {
  platform: process.platform,
  getWebviewPreloadPath: () => ipcRenderer.invoke("get-webview-preload-path"),

  // Main window -> main process: a webview wants to show a notification.
  showNotification: (payload: NotificationPayload) => ipcRenderer.send("show-notification", payload),
  // Main process -> main window: a notification popup was clicked, switch to that service.
  onNotificationClick: (callback: (serviceId: string) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, serviceId: string) => callback(serviceId);
    ipcRenderer.on("notification-clicked", listener);
    return () => ipcRenderer.removeListener("notification-clicked", listener);
  },

  // Notification popup window only, below:
  onNotificationData: (callback: (payload: NotificationPayload) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: NotificationPayload) =>
      callback(payload);
    ipcRenderer.on("notification-data", listener);
    return () => ipcRenderer.removeListener("notification-data", listener);
  },
  activateNotificationService: (serviceId: string) =>
    ipcRenderer.send("activate-notification-service", serviceId),
  closeNotificationPopup: () => ipcRenderer.send("close-notification-popup"),

  checkForUpdates: () => ipcRenderer.invoke("check-for-updates"),
  openExternal: (url: string) => ipcRenderer.send("open-external", url),

  downloadUpdate: () => ipcRenderer.invoke("download-update"),
  relaunchApp: () => ipcRenderer.send("relaunch-app"),
  onUpdateDownloadProgress: (callback: (percent: number) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, percent: number) => callback(percent);
    ipcRenderer.on("update-download-progress", listener);
    return () => ipcRenderer.removeListener("update-download-progress", listener);
  },
  onUpdateInstalled: (callback: () => void) => {
    const listener = () => callback();
    ipcRenderer.on("update-installed", listener);
    return () => ipcRenderer.removeListener("update-installed", listener);
  },
  onUpdateError: (callback: (message: string) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, message: string) => callback(message);
    ipcRenderer.on("update-error", listener);
    return () => ipcRenderer.removeListener("update-error", listener);
  },

  store: {
    getAll: () => ipcRenderer.invoke("store:get-all"),
    set: (patch: Record<string, unknown>) => ipcRenderer.invoke("store:set", patch),
    onChange: (callback: (value: unknown) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, value: unknown) =>
        callback(value);
      ipcRenderer.on("store:changed", listener);
      return () => ipcRenderer.removeListener("store:changed", listener);
    },
  },

  notes: {
    list: () => ipcRenderer.invoke("notes:list") as Promise<Note[]>,
    save: (note: Note) => ipcRenderer.invoke("notes:save", note) as Promise<void>,
    delete: (id: string) => ipcRenderer.invoke("notes:delete", id) as Promise<void>,
    saveImage: (dataBase64: string, fileName: string) =>
      ipcRenderer.invoke("notes:save-image", { dataBase64, fileName }) as Promise<{ filename: string }>,
    onChanged: (callback: () => void) => {
      const listener = () => callback();
      ipcRenderer.on("notes-changed", listener);
      return () => ipcRenderer.removeListener("notes-changed", listener);
    },
  },

  birthdays: {
    list: () => ipcRenderer.invoke("birthdays:list") as Promise<Birthday[]>,
    save: (birthday: Birthday) => ipcRenderer.invoke("birthdays:save", birthday) as Promise<Birthday[]>,
    delete: (id: string) => ipcRenderer.invoke("birthdays:delete", id) as Promise<Birthday[]>,
  },

  drive: {
    sync: () => ipcRenderer.invoke("drive:sync") as Promise<{ ok: boolean; uploaded?: number; error?: string }>,
    onSyncStatus: (callback: (status: SyncStatus) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, status: SyncStatus) => callback(status);
      ipcRenderer.on("drive-sync-status", listener);
      return () => ipcRenderer.removeListener("drive-sync-status", listener);
    },
    downloadPendingImages: (filenames: string[]) =>
      ipcRenderer.invoke("drive:download-pending-images", filenames) as Promise<{ ok: boolean; error?: string }>,
    onImagesPending: (callback: (filenames: string[]) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, filenames: string[]) => callback(filenames);
      ipcRenderer.on("drive-images-pending", listener);
      return () => ipcRenderer.removeListener("drive-images-pending", listener);
    },
  },
});
