import type { ActivityItem, FolderItem } from "./activity.js";

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
      setFolders: (folders: string[]) => Promise<void>;
      getActivity: (timeoutMinutes: number, username: string, webhookUrl: string) => Promise<{
        folders: Array<{
          path: string;
          status: FolderItem["status"];
          lastActivityAt: number | null;
          languageTag: string | null;
        }>;
        activity: Array<ActivityItem & { timestamp: number }>;
      }>;
    };
  }
}
