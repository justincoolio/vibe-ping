import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("vibePingDesktop", {
  platform: process.platform,
  runtime: {
    chrome: process.versions.chrome,
    electron: process.versions.electron,
    node: process.versions.node
  },
  selectFolders: () => ipcRenderer.invoke("watcher:select-folders") as Promise<string[]>,
  setFolders: (folders: string[]) => ipcRenderer.invoke("watcher:set-folders", folders) as Promise<void>,
  getActivity: (timeoutMinutes: number, username: string, webhookUrl: string) =>
    ipcRenderer.invoke("watcher:get-activity", timeoutMinutes, username, webhookUrl) as Promise<{
      folders: Array<{
        path: string;
        status: "Watching" | "Idle" | "Needs review";
        lastActivityAt: number | null;
        languageTag: string | null;
      }>;
      activity: Array<{
        id: string;
        title: string;
        detail: string;
        time: string;
        timestamp: number;
      }>;
    }>
});
