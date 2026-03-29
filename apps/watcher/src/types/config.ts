export type WatcherConfig = {
  username: string;
  webhookUrl: string;
  watchedFolders: string[];
  timeoutMinutes: number;
  keepRunningInBackground: boolean;
  openAtLogin: boolean;
  startHidden: boolean;
};

export const DEFAULT_WATCHER_CONFIG: WatcherConfig = {
  username: "anonomous0123",
  webhookUrl: "",
  watchedFolders: [],
  timeoutMinutes: 30,
  keepRunningInBackground: true,
  openAtLogin: false,
  startHidden: false
};
