import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("electronAPI", {
  platform: process.platform,
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
