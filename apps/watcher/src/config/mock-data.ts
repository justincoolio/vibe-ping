import type { ActivityItem, FolderItem } from "../types/activity.js";

export const initialStatus = {
  label: "Monitoring in preview mode",
  detail: "Mock desktop shell only. Real file watching and backend sync are not connected yet.",
  timeoutMinutes: 30
};

export const initialFolders: FolderItem[] = [];

export const recentActivity: ActivityItem[] = [];
