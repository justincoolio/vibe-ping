import { Notification, app, BrowserWindow, dialog, ipcMain, type OpenDialogOptions } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { scanWatchedFolders } from "./services/activity-scanner.js";
import {
  appendBackendEvent,
  appendPresenceEvent,
  appendStatusSnapshot,
  initializeLocalNotifier
} from "./services/local-notifier.js";
import type { PresenceState } from "./types/activity.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const shouldOpenNotifierTerminal = process.env.VIBEPING_OPEN_NOTIFIER_TERMINAL === "1";
let watchedFolders: string[] = [];
const presenceStateByPath = new Map<string, PresenceState>();
let aggregatePresenceState: PresenceState | undefined;
let presenceEvents: Array<{
  id: string;
  title: string;
  detail: string;
  time: string;
  timestamp: number;
}> = [];

type PresenceUpdate = {
  username: string;
  projectName: string;
  folderPath: string;
  status: PresenceState;
  timestamp: string;
  languageTag?: string;
  webhookUrl?: string;
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

ipcMain.handle("watcher:set-folders", async (_event, folderPaths: string[]) => {
  watchedFolders = folderPaths;
});

ipcMain.handle(
  "watcher:get-activity",
  async (_event, timeoutMinutes: number, username: string, webhookUrl: string) => {
  const snapshot = await scanWatchedFolders(watchedFolders, {
    timeoutMinutes,
    maxEntries: 120,
    maxDepth: 5
  });

  const now = Date.now();
  const cleanUsername = username.trim() || "anonomous0123";
  let activeProjectName: string | null = null;
  let activeFolderPath: string | null = null;
  let activeLanguageTag: string | null = null;

  snapshot.folders.forEach((folder) => {
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
            ? `${cleanUsername} is vibe coding ${folderName}. ${folder.languageTag}`
            : `${cleanUsername} is vibe coding ${folderName}`
          : `${cleanUsername} is offline ${folderName}`;

      const event = {
        id: `${folder.path}-${now}-${nextPresence}`,
        title: message,
        detail: folder.path,
        time: "just now",
        timestamp: now
      };

      presenceEvents = [event, ...presenceEvents].slice(0, 12);
      console.log(`[VibePing] ${message}`);
      void appendPresenceEvent(`[presence] ${message}`);
    }

    if (shouldNotifyIdle) {
      const idleMessage = `${cleanUsername} has been idle in ${folderName} for ${timeoutMinutes} minutes`;
      const event = {
        id: `${folder.path}-${now}-idle-notification`,
        title: idleMessage,
        detail: folder.path,
        time: "just now",
        timestamp: now
      };

      presenceEvents = [event, ...presenceEvents].slice(0, 12);
      console.log(`[VibePing] ${idleMessage}`);
      void appendPresenceEvent(`[idle] ${idleMessage}`);
      showIdleNotification(folderName, timeoutMinutes);
    }

    if (shouldNotifyActive) {
      activeProjectName = folderName;
      activeFolderPath = folder.path;

      if (previousPresence === undefined) {
        const message = `${cleanUsername} is vibe coding ${folderName}`;
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
        void appendPresenceEvent(`[presence] ${messageWithLanguage}`);
      }

      activeLanguageTag = folder.languageTag;
    }

    presenceStateByPath.set(folder.path, nextPresence);
  });

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
    void sendPresenceUpdate({
      username: cleanUsername,
      projectName: activeProjectName,
      folderPath: activeFolderPath ?? watchedFolders[0] ?? activeProjectName,
      status: nextAggregatePresence,
      timestamp: new Date(now).toISOString(),
      languageTag: activeLanguageTag ?? undefined,
      webhookUrl: webhookUrl.trim() || undefined
    });
  }

  if (
    snapshot.folders.length > 0 &&
    nextAggregatePresence === "Offline" &&
    aggregatePresenceState === "Currently vibe coding"
  ) {
    void sendPresenceUpdate({
      username: cleanUsername,
      projectName: activeProjectName ?? path.basename(watchedFolders[0] ?? "workspace"),
      folderPath: watchedFolders[0] ?? "",
      status: nextAggregatePresence,
      timestamp: new Date(now).toISOString(),
      webhookUrl: webhookUrl.trim() || undefined
    });
  }

  aggregatePresenceState = nextAggregatePresence;

  void appendStatusSnapshot(cleanUsername, snapshot.folders);

  return {
    folders: snapshot.folders,
    activity: [...presenceEvents, ...snapshot.activity]
      .sort((left, right) => right.timestamp - left.timestamp)
      .slice(0, 8)
  };
});

function createMainWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 430,
    height: 620,
    minWidth: 390,
    minHeight: 540,
    backgroundColor: "#0b1116",
    title: "VibePing",
    webPreferences: {
      preload: path.join(__dirname, "../src/preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  window.loadFile(path.join(__dirname, "../src/renderer/index.html"));

  return window;
}

app.whenReady().then(() => {
  void initializeLocalNotifier({ openTerminal: shouldOpenNotifierTerminal });
  createMainWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

async function sendPresenceUpdate(payload: PresenceUpdate): Promise<void> {
  const backendUrl = process.env.VIBEPING_BACKEND_URL ?? "http://127.0.0.1:4040/presence/update";
  const sendingMessage = `[watcher->backend] sending ${payload.username} ${payload.status} ${payload.projectName}`;
  console.log(sendingMessage);
  await appendBackendEvent(sendingMessage);

  try {
    const response = await fetch(backendUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    const resultMessage = response.ok
      ? `[watcher->backend] delivered ${payload.projectName} (${response.status})`
      : `[watcher->backend] failed ${payload.projectName} (${response.status})`;

    console.log(resultMessage);
    await appendBackendEvent(resultMessage);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown send error";
    const resultMessage = `[watcher->backend] error ${payload.projectName} (${message})`;
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

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
