import type { ActivityItem, FolderItem } from "./activity.js";
import type { WatcherConfig } from "./config.js";

export {};

declare global {
  interface Window {
    vibePingDesktop: {
      platform: string;
      runtime: {
        chrome: string;
        electron: string;
        node: string;
      };
      selectFolders: () => Promise<string[]>;
      getConfig: () => Promise<WatcherConfig>;
      updateConfig: (nextConfig: Partial<WatcherConfig>) => Promise<WatcherConfig>;
      testDiscordConnection: () => Promise<{
        delivered: boolean;
        message: string;
        checkedAt: string;
      }>;
      getState: () => Promise<{
        folders: Array<{
          path: string;
          status: FolderItem["status"];
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
        activity: Array<ActivityItem & { timestamp: number }>;
      }>;
    };
  }
}
