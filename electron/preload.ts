import { contextBridge, ipcRenderer } from "electron";

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
  quitAndInstall: () => ipcRenderer.send("quit-and-install"),
  onUpdateDownloadProgress: (callback: (percent: number) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, percent: number) => callback(percent);
    ipcRenderer.on("update-download-progress", listener);
    return () => ipcRenderer.removeListener("update-download-progress", listener);
  },
  onUpdateDownloaded: (callback: () => void) => {
    const listener = () => callback();
    ipcRenderer.on("update-downloaded", listener);
    return () => ipcRenderer.removeListener("update-downloaded", listener);
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
});
