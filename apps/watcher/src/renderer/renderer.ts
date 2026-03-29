import {
  initialFolders,
  initialStatus,
  recentActivity
} from "../config/mock-data.js";
import type { ActivityItem, FolderItem, PresenceState } from "../types/activity.js";

function requireElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);

  if (!element) {
    throw new Error(`Renderer boot failed: missing required UI element ${selector}.`);
  }

  return element;
}

const folderList = requireElement<HTMLElement>("#folder-list");
const addFolderButton = requireElement<HTMLButtonElement>("#add-folder-button");
const removeFolderButton = requireElement<HTMLButtonElement>("#remove-folder-button");
const activityList = requireElement<HTMLElement>("#activity-list");
const runtimeBadge = requireElement<HTMLElement>("#runtime-badge");
const usernameDisplay = requireElement<HTMLButtonElement>("#username-display");
const usernameInput = requireElement<HTMLInputElement>("#username-input");
const webhookInput = requireElement<HTMLInputElement>("#webhook-input");
const webhookValidationMessage = requireElement<HTMLElement>("#webhook-validation-message");
const desktopApi = window.vibePingDesktop;

let activityItems: ActivityItem[] = [...recentActivity];
let username = readStoredValue("vibeping.username", "anonomous0123");
let webhookUrl = readStoredValue("vibeping.discordWebhook", "");
const timeoutMinutes = Number(
  readStoredValue("vibeping.timeoutMinutes", String(initialStatus.timeoutMinutes))
);
let folders = readStoredFolders();
let selectedFolderId = readSelectedFolderId(folders);

usernameInput.value = username;
usernameDisplay.textContent = `@${username}`;
webhookInput.value = webhookUrl;

function readStoredValue(key: string, fallback: string): string {
  return window.localStorage.getItem(key) ?? fallback;
}

function writeStoredValue(key: string, value: string): void {
  window.localStorage.setItem(key, value);
}

function readStoredFolders(): FolderItem[] {
  const rawValue = window.localStorage.getItem("vibeping.folders");

  if (!rawValue) {
    return [...initialFolders];
  }

  try {
    const parsed = JSON.parse(rawValue) as string[];

    if (!Array.isArray(parsed)) {
      return [...initialFolders];
    }

    return parsed.map((folderPath) => ({
      id: createFolderId(folderPath),
      label: folderPath,
      status: "Watching",
      languageTag: null
    }));
  } catch {
    return [...initialFolders];
  }
}

function readSelectedFolderId(currentFolders: FolderItem[]): string | null {
  const storedPath = window.localStorage.getItem("vibeping.selectedFolderPath");

  if (!storedPath) {
    return currentFolders[0]?.id ?? null;
  }

  const matchingFolder = currentFolders.find((folder) => folder.label === storedPath);

  return matchingFolder?.id ?? currentFolders[0]?.id ?? null;
}

function createFolderId(folderPath: string): string {
  return `folder-${folderPath}`;
}

function persistFolders(): void {
  writeStoredValue(
    "vibeping.folders",
    JSON.stringify(folders.map((folder) => folder.label))
  );
}

function persistSelectedFolder(): void {
  const selectedFolder = folders.find((folder) => folder.id === selectedFolderId);

  if (!selectedFolder) {
    window.localStorage.removeItem("vibeping.selectedFolderPath");
    return;
  }

  writeStoredValue("vibeping.selectedFolderPath", selectedFolder.label);
}

function setStatus(label: string, detail: string): void {
  document.title = label === initialStatus.label ? "VibePing" : `VibePing - ${label}`;
  console.info("[VibePing]", label, detail);
}

function validateDiscordWebhookUrl(value: string): { valid: boolean; message: string } {
  if (!value) {
    return {
      valid: true,
      message: "Webhook not set. Discord notifications are currently off."
    };
  }

  let parsedUrl: URL;

  try {
    parsedUrl = new URL(value);
  } catch {
    return {
      valid: false,
      message: "Enter a full Discord webhook URL."
    };
  }

  const validHosts = new Set(["discord.com", "ptb.discord.com", "canary.discord.com"]);
  const isValidPath = /^\/api\/webhooks\/\d+\/[\w-]+$/u.test(parsedUrl.pathname);

  if (parsedUrl.protocol !== "https:" || !validHosts.has(parsedUrl.host) || !isValidPath) {
    return {
      valid: false,
      message: "That does not look like a valid Discord webhook URL."
    };
  }

  return {
    valid: true,
    message: "Discord webhook looks valid."
  };
}

function renderWebhookValidation(): boolean {
  const validation = validateDiscordWebhookUrl(webhookInput.value.trim());

  webhookInput.classList.toggle("is-invalid", !validation.valid);
  webhookInput.setAttribute("aria-invalid", String(!validation.valid));
  webhookValidationMessage.textContent = validation.message;
  webhookValidationMessage.classList.toggle("is-invalid", !validation.valid);

  return validation.valid;
}

function renderFolders(): void {
  folderList.innerHTML = "";

  if (folders.length === 0) {
    const emptyState = document.createElement("li");
    emptyState.className = "activity-item";
    emptyState.textContent = "No folders selected yet. Click Add to choose a folder to watch.";
    folderList.append(emptyState);
    removeFolderButton.disabled = true;
    return;
  }

  folders.forEach((folder, index) => {
    const item = document.createElement("li");
    const button = document.createElement("button");
    const content = document.createElement("div");
    const title = document.createElement("strong");
    const pathLabel = document.createElement("span");
    const indexBadge = document.createElement("span");
    const badgeGroup = document.createElement("div");
    const statusBadge = document.createElement("span");
    const presenceBadge = document.createElement("span");
    const languageBadge = document.createElement("span");
    const presenceState: PresenceState =
      folder.status === "Watching" ? "Currently vibe coding" : "Offline";
    const isActive = presenceState === "Currently vibe coding";

    button.type = "button";
    button.className = "folder-item";

    if (folder.id === selectedFolderId) {
      button.classList.add("is-selected");
    }

    button.addEventListener("click", () => {
      selectedFolderId = folder.id;
      persistSelectedFolder();
      renderFolders();
    });

    indexBadge.className = "folder-item__index";
    indexBadge.textContent = String(index + 1).padStart(2, "0");

    title.textContent = folder.label.split("/").at(-1) ?? folder.label;

    pathLabel.className = "folder-item__path";
    pathLabel.textContent = folder.label;

    statusBadge.className = "folder-item__status";
    statusBadge.textContent = folder.status;

    presenceBadge.className = `folder-item__presence ${isActive ? "is-active" : "is-offline"}`;
    presenceBadge.textContent = presenceState;

    languageBadge.className = "folder-item__language";
    languageBadge.textContent = folder.languageTag ?? "";

    badgeGroup.className = "folder-item__badges";
    badgeGroup.append(statusBadge, presenceBadge);

    if (folder.languageTag) {
      badgeGroup.append(languageBadge);
    }

    content.append(title, pathLabel);
    button.append(indexBadge, content, badgeGroup);
    item.append(button);
    folderList.append(item);
  });

  removeFolderButton.disabled = folders.length === 0 || selectedFolderId === null;
}

function renderActivity(): void {
  activityList.innerHTML = "";

  if (activityItems.length === 0) {
    const emptyState = document.createElement("li");
    emptyState.className = "activity-item";
    emptyState.textContent = "No recent activity yet.";
    activityList.append(emptyState);
    return;
  }

  activityItems.forEach((activity) => {
    const item = document.createElement("li");
    const top = document.createElement("div");
    const title = document.createElement("strong");
    const time = document.createElement("span");
    const detail = document.createElement("p");

    item.className = "activity-item";
    top.className = "activity-item__top";
    time.className = "activity-item__time";
    detail.className = "activity-item__detail";

    title.textContent = activity.title;
    time.textContent = activity.time;
    detail.textContent = activity.detail;

    top.append(title, time);
    item.append(top, detail);
    activityList.append(item);
  });
}

async function refreshActivity(): Promise<void> {
  if (!desktopApi?.getActivity || !desktopApi?.setFolders) {
    return;
  }

  await desktopApi.setFolders(folders.map((folder) => folder.label));
  const snapshot = await desktopApi.getActivity(
    timeoutMinutes,
    username,
    webhookUrl
  );

  const statusByPath = new Map(snapshot.folders.map((folder) => [folder.path, folder.status]));
  const languageTagByPath = new Map(snapshot.folders.map((folder) => [folder.path, folder.languageTag]));
  folders = folders.map((folder) => ({
    ...folder,
    status: statusByPath.get(folder.label) ?? folder.status,
    languageTag: languageTagByPath.get(folder.label) ?? folder.languageTag
  }));
  activityItems = snapshot.activity.map(({ timestamp: _timestamp, ...activity }) => activity);

  renderFolders();
  renderActivity();
}

function normalizeUsername(value: string): string {
  const normalized = value
    .trim()
    .replace(/^@+/, "")
    .replace(/[^a-zA-Z0-9_-]/g, "")
    .slice(0, 24);

  return normalized || "anonomous0123";
}

function commitUsername(): void {
  username = normalizeUsername(usernameInput.value);
  usernameInput.value = username;
  usernameDisplay.textContent = `@${username}`;
  writeStoredValue("vibeping.username", username);
  usernameDisplay.classList.remove("is-hidden");
  usernameInput.classList.add("is-hidden");
  void refreshActivity();
}

function saveWebhook(): void {
  const nextWebhookUrl = webhookInput.value.trim();
  const validation = validateDiscordWebhookUrl(nextWebhookUrl);

  if (!validation.valid) {
    renderWebhookValidation();
    setStatus("Invalid webhook URL", validation.message);
    return;
  }

  webhookUrl = nextWebhookUrl;
  writeStoredValue("vibeping.discordWebhook", webhookUrl);
  setStatus(
    webhookUrl ? "Discord connected" : initialStatus.label,
    webhookUrl
      ? "Discord webhook saved locally for future coding updates."
      : initialStatus.detail
  );
}

async function addSelectedFolders(): Promise<void> {
  setStatus("Opening folder picker", "Choose one or more folders for VibePing to track.");

  if (!desktopApi?.selectFolders) {
    setStatus(
      "Folder picker unavailable",
      "Desktop bridge not found. Restart the app so the latest preload script is loaded."
    );
    return;
  }

  let selectedPaths: string[];

  try {
    selectedPaths = await desktopApi.selectFolders();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown picker error";
    setStatus("Folder picker unavailable", message);
    return;
  }

  if (selectedPaths.length === 0) {
    setStatus(initialStatus.label, initialStatus.detail);
    return;
  }

  const existingPaths = new Set(folders.map((folder) => folder.label));
  const nextFolders = selectedPaths
    .filter((selectedPath) => !existingPaths.has(selectedPath))
    .map<FolderItem>((selectedPath) => ({
      id: createFolderId(selectedPath),
      label: selectedPath,
      status: "Watching",
      languageTag: null
    }));

  if (nextFolders.length === 0) {
    setStatus("No new folders added", "Those folders are already in the watch list.");
    return;
  }

  folders = [...folders, ...nextFolders];
  selectedFolderId = nextFolders.at(-1)?.id ?? selectedFolderId;
  persistFolders();
  persistSelectedFolder();
  setStatus("Folders selected", `${nextFolders.length} folder${nextFolders.length === 1 ? "" : "s"} added to the watch list.`);
  await refreshActivity();
}

function removeSelectedFolder(): void {
  if (selectedFolderId === null) {
    return;
  }

  folders = folders.filter((folder) => folder.id !== selectedFolderId);
  selectedFolderId = folders[0]?.id ?? null;
  persistFolders();
  persistSelectedFolder();
  void refreshActivity();
}

addFolderButton.addEventListener("click", () => {
  void addSelectedFolders();
});
removeFolderButton.addEventListener("click", removeSelectedFolder);
webhookInput.addEventListener("change", () => {
  saveWebhook();
  void refreshActivity();
});
webhookInput.addEventListener("input", () => {
  renderWebhookValidation();
});
webhookInput.addEventListener("blur", () => {
  saveWebhook();
  void refreshActivity();
});
usernameDisplay.addEventListener("click", () => {
  usernameDisplay.classList.add("is-hidden");
  usernameInput.classList.remove("is-hidden");
  usernameInput.focus();
  usernameInput.select();
});
usernameInput.addEventListener("blur", commitUsername);
usernameInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    commitUsername();
  }

  if (event.key === "Escape") {
    usernameInput.value = username;
    usernameDisplay.classList.remove("is-hidden");
    usernameInput.classList.add("is-hidden");
  }
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    webhookInput.value = webhookUrl;
  }
});

if (!desktopApi?.runtime) {
  setStatus(
    "Desktop bridge unavailable",
    "The preload script did not initialize. Restart the app to load the Electron bridge."
  );
} else {
  runtimeBadge.textContent = `Electron ${desktopApi.runtime.electron} • Node ${desktopApi.runtime.node} • ${desktopApi.platform}`;
}

renderWebhookValidation();
renderFolders();
renderActivity();
void refreshActivity();
window.setInterval(() => {
  void refreshActivity();
}, 10000);
