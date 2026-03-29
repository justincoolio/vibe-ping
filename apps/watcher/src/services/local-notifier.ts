import { appendFile, mkdir, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import type { WatchedFolderSnapshot } from "./activity-scanner.js";

let notifierLogPath: string | null = null;
let terminalOpened = false;

type LocalNotifierOptions = {
  openTerminal?: boolean;
};

export async function initializeLocalNotifier(
  options: LocalNotifierOptions = {}
): Promise<void> {
  const logsDir = path.join(tmpdir(), "vibeping");
  notifierLogPath = path.join(logsDir, "presence.log");

  await mkdir(logsDir, { recursive: true });
  await writeFile(
    notifierLogPath,
    [
      "VibePing Local Notifier",
      "-----------------------",
      "Waiting for status updates...",
      ""
    ].join("\n"),
    "utf8"
  );

  if (options.openTerminal) {
    await openNotifierTerminal();
  }
}

export async function appendPresenceEvent(message: string): Promise<void> {
  await appendLogLines([message]);
}

export async function appendStatusSnapshot(
  username: string,
  folders: WatchedFolderSnapshot[]
): Promise<void> {
  const timestamp = new Date().toLocaleTimeString();
  const lines =
    folders.length === 0
      ? [`[${timestamp}] @${username} has no watched folders configured`]
      : folders.map((folder) => {
          const folderName = path.basename(folder.path);
          const liveStatus = folder.status === "Watching" ? "Currently vibe coding" : "Offline";
          return `[${timestamp}] @${username} | ${folderName} | ${liveStatus}`;
        });

  await appendLogLines(lines);
}

export async function appendBackendEvent(message: string): Promise<void> {
  await appendLogLines([message]);
}

async function appendLogLines(lines: string[]): Promise<void> {
  if (!notifierLogPath) {
    return;
  }

  const payload = `${lines.join("\n")}\n`;
  await appendFile(notifierLogPath, payload, "utf8");
}

async function openNotifierTerminal(): Promise<void> {
  if (terminalOpened || !notifierLogPath || process.platform !== "darwin") {
    return;
  }

  const command = [
    "clear",
    "echo 'VibePing Local Notifier'",
    "echo 'Streaming presence updates every 10 seconds...'",
    `tail -n 40 -f ${shellQuote(notifierLogPath)}`
  ].join("; ");

  const script = [
    'tell application "Terminal"',
    "activate",
    `do script ${appleScriptString(command)}`,
    "end tell"
  ].join("\n");

  const child = spawn("osascript", ["-e", script], {
    detached: true,
    stdio: "ignore"
  });

  child.unref();
  terminalOpened = true;
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function appleScriptString(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}
