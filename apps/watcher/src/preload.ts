import { contextBridge, ipcRenderer } from "electron";
import type { WatcherConfig } from "./types/config.js";

contextBridge.exposeInMainWorld("vibePingDesktop", {
  platform: process.platform,
  runtime: {
    chrome: process.versions.chrome,
    electron: process.versions.electron,
    node: process.versions.node
  },
  selectFolders: () => ipcRenderer.invoke("watcher:select-folders") as Promise<string[]>,
  getConfig: () => ipcRenderer.invoke("watcher:get-config") as Promise<WatcherConfig>,
  updateConfig: (nextConfig: Partial<WatcherConfig>) =>
    ipcRenderer.invoke("watcher:update-config", nextConfig) as Promise<WatcherConfig>,
  testDiscordConnection: () =>
    ipcRenderer.invoke("watcher:test-discord-connection") as Promise<{
      delivered: boolean;
      message: string;
      checkedAt: string;
    }>,
  getState: () =>
    ipcRenderer.invoke("watcher:get-state") as Promise<{
      folders: Array<{
        path: string;
        status: "Watching" | "Idle" | "Needs review";
        lastActivityAt: number | null;
        languageTag: string | null;
      }>;
      discord: {
        configured: boolean;
        status: "unknown" | "success" | "error";
        message: string;
        checkedAt: string | null;
        lastDeliveredAt: string | null;
      };
      activity: Array<{
        id: string;
        title: string;
        detail: string;
        time: string;
        timestamp: number;
      }>;
    }>
});
