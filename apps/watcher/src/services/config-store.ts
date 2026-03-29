import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { app } from "electron";
import {
  DEFAULT_WATCHER_CONFIG,
  type WatcherConfig
} from "../types/config.js";

function getConfigPath(): string {
  return path.join(app.getPath("userData"), "watcher-config.json");
}

export async function loadWatcherConfig(): Promise<WatcherConfig> {
  try {
    const raw = await readFile(getConfigPath(), "utf8");
    return normalizeWatcherConfig(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_WATCHER_CONFIG };
  }
}

export async function saveWatcherConfig(config: WatcherConfig): Promise<void> {
  const configPath = getConfigPath();
  await mkdir(path.dirname(configPath), { recursive: true });
  await writeFile(configPath, JSON.stringify(config, null, 2), "utf8");
}

export function normalizeWatcherConfig(value: unknown): WatcherConfig {
  const candidate = (value ?? {}) as Partial<WatcherConfig>;

  return {
    username:
      typeof candidate.username === "string" && candidate.username.trim()
        ? candidate.username.trim()
        : DEFAULT_WATCHER_CONFIG.username,
    webhookUrl: typeof candidate.webhookUrl === "string" ? candidate.webhookUrl.trim() : "",
    watchedFolders: Array.isArray(candidate.watchedFolders)
      ? candidate.watchedFolders.filter((entry): entry is string => typeof entry === "string")
      : [...DEFAULT_WATCHER_CONFIG.watchedFolders],
    timeoutMinutes:
      typeof candidate.timeoutMinutes === "number" && Number.isFinite(candidate.timeoutMinutes)
        ? Math.max(1, Math.round(candidate.timeoutMinutes))
        : DEFAULT_WATCHER_CONFIG.timeoutMinutes,
    keepRunningInBackground:
      typeof candidate.keepRunningInBackground === "boolean"
        ? candidate.keepRunningInBackground
        : DEFAULT_WATCHER_CONFIG.keepRunningInBackground,
    openAtLogin:
      typeof candidate.openAtLogin === "boolean"
        ? candidate.openAtLogin
        : DEFAULT_WATCHER_CONFIG.openAtLogin,
    startHidden:
      typeof candidate.startHidden === "boolean"
        ? candidate.startHidden
        : DEFAULT_WATCHER_CONFIG.startHidden
  };
}
