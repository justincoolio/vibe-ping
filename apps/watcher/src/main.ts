import {
  Menu,
  Notification,
  Tray,
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  nativeImage,
  type OpenDialogOptions
} from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { scanWatchedFolders } from "./services/activity-scanner.js";
import {
  loadWatcherConfig,
  normalizeWatcherConfig,
  saveWatcherConfig
} from "./services/config-store.js";
import {
  sendDiscordPresenceUpdate,
  sendDiscordWebhookMessage,
  type DiscordDeliveryResult
} from "./services/discord-webhook.js";
import {
  appendBackendEvent,
  appendPresenceEvent,
  appendStatusSnapshot,
  initializeLocalNotifier
} from "./services/local-notifier.js";
import type { WatcherConfig } from "./types/config.js";
import type { PresenceState } from "./types/activity.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const shouldOpenNotifierTerminal = process.env.VIBEPING_OPEN_NOTIFIER_TERMINAL === "1";
const watcherIntervalMs = 10_000;
const minimumTimeoutMinutes = 5;
const maximumTimeoutMinutes = 240;

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let watcherInterval: NodeJS.Timeout | null = null;
let isQuitting = false;
let currentConfig: WatcherConfig;
let presenceStateByPath = new Map<string, PresenceState>();
let aggregatePresenceState: PresenceState | undefined;
let presenceEvents: Array<{
  id: string;
  title: string;
  detail: string;
  time: string;
  timestamp: number;
}> = [];
let latestSnapshot: {
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
} = {
  folders: [],
  discord: {
    configured: false,
    status: "unknown",
    message: "Discord webhook not configured yet.",
    checkedAt: null,
    lastDeliveredAt: null
  },
  activity: []
};

ipcMain.handle("watcher:select-folders", async (event) => {
  const senderWindow = BrowserWindow.fromWebContents(event.sender);
  const options: OpenDialogOptions = {
    title: "Select folders to watch",
    properties: ["openDirectory", "multiSelections", "createDirectory"]
  };
  const result = senderWindow
    ? await dialog.showOpenDialog(senderWindow, options)
    : await dialog.showOpenDialog(options);

  if (result.canceled) {
    return [];
  }

  return result.filePaths;
});

ipcMain.handle("watcher:get-config", async () => ({ ...currentConfig }));

ipcMain.handle("watcher:update-config", async (_event, nextConfig: Partial<WatcherConfig>) => {
  currentConfig = normalizeWatcherConfig({
    ...currentConfig,
    ...nextConfig
  });
  currentConfig.timeoutMinutes = Math.min(
    maximumTimeoutMinutes,
    Math.max(minimumTimeoutMinutes, currentConfig.timeoutMinutes)
  );
  if (!currentConfig.openAtLogin) {
    currentConfig.startHidden = false;
  }
  await saveWatcherConfig(currentConfig);
  updateConfiguredDiscordState();
  applyLoginItemSettings();
  syncPresenceTracking();
  refreshTrayMenu();
  await refreshWatcherState();
  return { ...currentConfig };
});

ipcMain.handle("watcher:get-state", async () => latestSnapshot);

ipcMain.handle("watcher:test-discord-connection", async () => {
  const checkedAt = new Date().toISOString();
  const result = await sendDiscordWebhookMessage({
    webhookUrl: currentConfig.webhookUrl || undefined,
    content: `VibePing test message from @${currentConfig.username}. Discord connection looks good.`
  });

  updateDiscordStatus(result, {
    checkedAt,
    successMessage: "Test message delivered to Discord.",
    errorPrefix: "Discord test failed"
  });

  return {
    delivered: result.delivered,
    message: latestSnapshot.discord.message,
    checkedAt
  };
});

const singleInstanceLock = app.requestSingleInstanceLock();

if (!singleInstanceLock) {
  app.quit();
}

app.on("second-instance", () => {
  showMainWindow();
});

function createMainWindow(showOnCreate = true): BrowserWindow {
  const window = new BrowserWindow({
    width: 430,
    height: 700,
    minWidth: 390,
    minHeight: 620,
    backgroundColor: "#0b1116",
    title: "VibePing",
    show: showOnCreate,
    webPreferences: {
      preload: path.join(__dirname, "../src/preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  window.loadFile(path.join(__dirname, "../src/renderer/index.html"));

  window.on("close", (event) => {
    if (!isQuitting && currentConfig.keepRunningInBackground) {
      event.preventDefault();
      window.hide();
    }
  });

  window.on("closed", () => {
    if (mainWindow === window) {
      mainWindow = null;
    }
  });

  return window;
}

function createTray(): Tray {
  const nextTray = new Tray(createTrayImage());
  nextTray.setToolTip("VibePing");
  nextTray.on("click", () => {
    if (mainWindow?.isVisible()) {
      mainWindow.focus();
      return;
    }

    showMainWindow();
  });

  return nextTray;
}

function createTrayImage() {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16">
      <rect x="2" y="2" width="12" height="12" rx="4" fill="#ffffff" />
      <circle cx="8" cy="8" r="2.2" fill="#000000" />
    </svg>
  `.trim();
  const image = nativeImage.createFromDataURL(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`);

  if (process.platform === "darwin") {
    image.setTemplateImage(true);
  }

  return image;
}

function refreshTrayMenu(): void {
  if (!tray) {
    return;
  }

  const hasWindow = Boolean(mainWindow);
  const isVisible = mainWindow?.isVisible() ?? false;
  const statusLabel =
    aggregatePresenceState === "Currently vibe coding" ? "Currently vibe coding" : "Offline";

  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: isVisible ? "Hide VibePing" : "Open VibePing",
        click: () => {
          if (mainWindow?.isVisible()) {
            mainWindow.hide();
            return;
          }

          showMainWindow();
        }
      },
      {
        label: `Status: ${statusLabel}`,
        enabled: false
      },
      {
        label: `Mode: ${currentConfig.keepRunningInBackground ? "Runs in background" : "Quits on close"}`,
        enabled: false
      },
      {
        label: `Launch at login: ${currentConfig.openAtLogin ? "On" : "Off"}`,
        enabled: false
      },
      {
        type: "separator"
      },
      {
        label: hasWindow ? "Focus Window" : "Create Window",
        click: () => showMainWindow()
      },
      {
        label: "Quit VibePing",
        click: () => {
          isQuitting = true;
          app.quit();
        }
      }
    ])
  );
}

function applyLoginItemSettings(): void {
  app.setLoginItemSettings({
    openAtLogin: currentConfig.openAtLogin,
    openAsHidden: currentConfig.openAtLogin && currentConfig.startHidden
  });
}

function shouldStartHidden(): boolean {
  const loginItemSettings = app.getLoginItemSettings();
  return currentConfig.openAtLogin && currentConfig.startHidden && Boolean(loginItemSettings.wasOpenedAtLogin);
}

function showMainWindow(): void {
  if (!mainWindow) {
    mainWindow = createMainWindow();
  }

  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }

  mainWindow.show();
  mainWindow.focus();
}

function startWatcherLoop(): void {
  if (watcherInterval) {
    clearInterval(watcherInterval);
  }

  watcherInterval = setInterval(() => {
    void refreshWatcherState();
  }, watcherIntervalMs);
}

function syncPresenceTracking(): void {
  const watchedFolderSet = new Set(currentConfig.watchedFolders);

  presenceStateByPath = new Map(
    [...presenceStateByPath.entries()].filter(([folderPath]) => watchedFolderSet.has(folderPath))
  );

  if (watchedFolderSet.size === 0) {
    aggregatePresenceState = undefined;
  }
}

async function refreshWatcherState(): Promise<void> {
  const snapshot = await scanWatchedFolders(currentConfig.watchedFolders, {
    timeoutMinutes: currentConfig.timeoutMinutes,
    maxEntries: 120,
    maxDepth: 5
  });

  latestSnapshot = await deriveSnapshot(snapshot);
  refreshTrayMenu();
}

function updateConfiguredDiscordState(): void {
  const configured = Boolean(currentConfig.webhookUrl.trim());
  latestSnapshot.discord = {
    ...latestSnapshot.discord,
    configured,
    status: configured ? latestSnapshot.discord.status : "unknown",
    message: configured ? latestSnapshot.discord.message : "Discord webhook not configured yet.",
    checkedAt: configured ? latestSnapshot.discord.checkedAt : null
  };
}

function updateDiscordStatus(
  result: DiscordDeliveryResult,
  options: {
    checkedAt: string;
    successMessage: string;
    errorPrefix: string;
  }
): void {
  latestSnapshot.discord = {
    configured: Boolean(currentConfig.webhookUrl.trim()),
    status: result.delivered ? "success" : "error",
    message: result.delivered
      ? options.successMessage
      : `${options.errorPrefix}: ${result.reason ?? "Unknown error"}`,
    checkedAt: options.checkedAt,
    lastDeliveredAt: result.delivered ? options.checkedAt : latestSnapshot.discord.lastDeliveredAt
  };
}

async function deriveSnapshot(snapshot: {
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
}): Promise<typeof latestSnapshot> {
  const now = Date.now();
  let activeProjectName: string | null = null;
  let activeFolderPath: string | null = null;
  let activeLanguageTag: string | null = null;

  for (const folder of snapshot.folders) {
    const nextPresence = folder.status === "Watching" ? "Currently vibe coding" : "Offline";
    const previousPresence = presenceStateByPath.get(folder.path);
    const folderName = path.basename(folder.path);
    const shouldNotifyActive =
      nextPresence === "Currently vibe coding" &&
      (previousPresence === undefined || previousPresence !== nextPresence);
    const shouldNotifyIdle =
      folder.status === "Idle" && previousPresence === "Currently vibe coding";

    if (folder.status === "Watching" && activeProjectName === null) {
      activeProjectName = folderName;
      activeFolderPath = folder.path;
      activeLanguageTag = folder.languageTag;
    }

    if (previousPresence !== undefined && previousPresence !== nextPresence) {
      const message =
        nextPresence === "Currently vibe coding"
          ? folder.languageTag
            ? `${currentConfig.username} is vibe coding ${folderName}. ${folder.languageTag}`
            : `${currentConfig.username} is vibe coding ${folderName}`
          : `${currentConfig.username} is offline ${folderName}`;

      const event = {
        id: `${folder.path}-${now}-${nextPresence}`,
        title: message,
        detail: folder.path,
        time: "just now",
        timestamp: now
      };

      presenceEvents = [event, ...presenceEvents].slice(0, 12);
      console.log(`[VibePing] ${message}`);
      await appendPresenceEvent(`[presence] ${message}`);
    }

    if (shouldNotifyIdle) {
      const idleMessage = `${currentConfig.username} has been idle in ${folderName} for ${currentConfig.timeoutMinutes} minutes`;
      const event = {
        id: `${folder.path}-${now}-idle-notification`,
        title: idleMessage,
        detail: folder.path,
        time: "just now",
        timestamp: now
      };

      presenceEvents = [event, ...presenceEvents].slice(0, 12);
      console.log(`[VibePing] ${idleMessage}`);
      await appendPresenceEvent(`[idle] ${idleMessage}`);
      showIdleNotification(folderName, currentConfig.timeoutMinutes);
    }

    if (shouldNotifyActive) {
      activeProjectName = folderName;
      activeFolderPath = folder.path;
      activeLanguageTag = folder.languageTag;

      if (previousPresence === undefined) {
        const message = `${currentConfig.username} is vibe coding ${folderName}`;
        const messageWithLanguage = folder.languageTag ? `${message}. ${folder.languageTag}` : message;
        const event = {
          id: `${folder.path}-${now}-initial-active`,
          title: messageWithLanguage,
          detail: folder.path,
          time: "just now",
          timestamp: now
        };

        presenceEvents = [event, ...presenceEvents].slice(0, 12);
        console.log(`[VibePing] ${messageWithLanguage}`);
        await appendPresenceEvent(`[presence] ${messageWithLanguage}`);
      }
    }

    presenceStateByPath.set(folder.path, nextPresence);
  }

  const nextAggregatePresence: PresenceState = snapshot.folders.some(
    (folder) => folder.status === "Watching"
  )
    ? "Currently vibe coding"
    : "Offline";

  if (
    activeProjectName &&
    nextAggregatePresence === "Currently vibe coding" &&
    aggregatePresenceState !== "Currently vibe coding"
  ) {
    await deliverPresenceUpdate({
      username: currentConfig.username,
      projectName: activeProjectName,
      folderPath: activeFolderPath ?? currentConfig.watchedFolders[0] ?? activeProjectName,
      status: nextAggregatePresence,
      timestamp: new Date(now).toISOString(),
      languageTag: activeLanguageTag ?? undefined,
      webhookUrl: currentConfig.webhookUrl || undefined
    });
  }

  if (
    snapshot.folders.length > 0 &&
    nextAggregatePresence === "Offline" &&
    aggregatePresenceState === "Currently vibe coding"
  ) {
    await deliverPresenceUpdate({
      username: currentConfig.username,
      projectName: activeProjectName ?? path.basename(currentConfig.watchedFolders[0] ?? "workspace"),
      folderPath: currentConfig.watchedFolders[0] ?? "",
      status: nextAggregatePresence,
      timestamp: new Date(now).toISOString(),
      webhookUrl: currentConfig.webhookUrl || undefined
    });
  }

  aggregatePresenceState = nextAggregatePresence;
  await appendStatusSnapshot(currentConfig.username, snapshot.folders);

  return {
    folders: snapshot.folders,
    discord: latestSnapshot.discord,
    activity: [...presenceEvents, ...snapshot.activity]
      .sort((left, right) => right.timestamp - left.timestamp)
      .slice(0, 8)
  };
}

async function deliverPresenceUpdate(payload: {
  username: string;
  projectName: string;
  folderPath: string;
  status: PresenceState;
  timestamp: string;
  languageTag?: string;
  webhookUrl?: string;
}): Promise<void> {
  const sendingMessage = `[discord] sending ${payload.username} ${payload.status} ${payload.projectName}`;
  console.log(sendingMessage);
  await appendBackendEvent(sendingMessage);

  try {
    const result = await sendDiscordPresenceUpdate(payload);
    updateDiscordStatus(result, {
      checkedAt: new Date().toISOString(),
      successMessage: `Last Discord update delivered for ${payload.projectName}.`,
      errorPrefix: "Discord delivery failed"
    });
    const resultMessage = result.delivered
      ? `[discord] delivered ${payload.projectName}`
      : `[discord] skipped ${payload.projectName} (${result.reason ?? "Unknown reason"})`;

    console.log(resultMessage);
    await appendBackendEvent(resultMessage);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown Discord send error";
    updateDiscordStatus(
      {
        delivered: false,
        reason: message
      },
      {
        checkedAt: new Date().toISOString(),
        successMessage: "",
        errorPrefix: "Discord delivery failed"
      }
    );
    const resultMessage = `[discord] error ${payload.projectName} (${message})`;
    console.error(resultMessage);
    await appendBackendEvent(resultMessage);
  }
}

function showIdleNotification(projectName: string, timeoutMinutes: number): void {
  if (!Notification.isSupported()) {
    return;
  }

  new Notification({
    title: "VibePing idle reminder",
    body: `${projectName} has been idle for ${timeoutMinutes} minutes.`,
    silent: false
  }).show();
}

app.on("before-quit", () => {
  isQuitting = true;
});

app.on("activate", () => {
  showMainWindow();
});

app.on("window-all-closed", () => {
  if (!currentConfig.keepRunningInBackground || process.platform !== "darwin") {
    app.quit();
  }
});

app.whenReady().then(async () => {
  currentConfig = await loadWatcherConfig();
  currentConfig.timeoutMinutes = Math.min(
    maximumTimeoutMinutes,
    Math.max(minimumTimeoutMinutes, currentConfig.timeoutMinutes)
  );
  if (!currentConfig.openAtLogin) {
    currentConfig.startHidden = false;
  }
  updateConfiguredDiscordState();
  syncPresenceTracking();
  await initializeLocalNotifier({ openTerminal: shouldOpenNotifierTerminal });
  applyLoginItemSettings();
  tray = createTray();
  mainWindow = createMainWindow(!shouldStartHidden());
  refreshTrayMenu();
  startWatcherLoop();
  await refreshWatcherState();
});
