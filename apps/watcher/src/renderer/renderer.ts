import {
  initialStatus,
  recentActivity
} from "../config/mock-data.js";
import type { ActivityItem, FolderItem, PresenceState } from "../types/activity.js";
import {
  DEFAULT_WATCHER_CONFIG,
  type WatcherConfig
} from "../types/config.js";

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
const testWebhookButton = requireElement<HTMLButtonElement>("#test-webhook-button");
const webhookValidationMessage = requireElement<HTMLElement>("#webhook-validation-message");
const discordStatusMessage = requireElement<HTMLElement>("#discord-status-message");
const discordStatusMeta = requireElement<HTMLElement>("#discord-status-meta");
const keepRunningCheckbox = requireElement<HTMLInputElement>("#keep-running-checkbox");
const openAtLoginCheckbox = requireElement<HTMLInputElement>("#open-at-login-checkbox");
const startHiddenCheckbox = requireElement<HTMLInputElement>("#start-hidden-checkbox");
const timeoutInput = requireElement<HTMLInputElement>("#timeout-input");
const timeoutValue = requireElement<HTMLElement>("#timeout-value");
const desktopApi = window.vibePingDesktop;

let activityItems: ActivityItem[] = [...recentActivity];
let config: WatcherConfig = { ...DEFAULT_WATCHER_CONFIG };
let folders: FolderItem[] = [];
let selectedFolderId: string | null = null;

function createFolderId(folderPath: string): string {
  return `folder-${folderPath}`;
}

function normalizeUsername(value: string): string {
  const normalized = value
    .trim()
    .replace(/^@+/, "")
    .replace(/[^a-zA-Z0-9_-]/g, "")
    .slice(0, 24);

  return normalized || DEFAULT_WATCHER_CONFIG.username;
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

function formatTimestamp(value: string | null): string {
  if (!value) {
    return "Not checked yet.";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Not checked yet.";
  }

  return date.toLocaleString();
}

function renderDiscordStatus(discord: {
  configured: boolean;
  status: "unknown" | "success" | "error";
  message: string;
  checkedAt: string | null;
  lastDeliveredAt: string | null;
}): void {
  discordStatusMessage.textContent = discord.message;
  discordStatusMessage.classList.toggle("is-success", discord.status === "success");
  discordStatusMessage.classList.toggle("is-error", discord.status === "error");

  if (!discord.configured) {
    discordStatusMeta.textContent = "Add a webhook URL to test your connection.";
    return;
  }

  const checkedLabel = `Last checked: ${formatTimestamp(discord.checkedAt)}`;
  const deliveredLabel = discord.lastDeliveredAt
    ? `Last delivered: ${formatTimestamp(discord.lastDeliveredAt)}`
    : "No Discord deliveries yet.";
  discordStatusMeta.textContent = `${checkedLabel} • ${deliveredLabel}`;
}

function applyConfigToInputs(): void {
  usernameInput.value = config.username;
  usernameDisplay.textContent = `@${config.username}`;
  webhookInput.value = config.webhookUrl;
  keepRunningCheckbox.checked = config.keepRunningInBackground;
  openAtLoginCheckbox.checked = config.openAtLogin;
  startHiddenCheckbox.checked = config.startHidden;
  startHiddenCheckbox.disabled = !config.openAtLogin;
  timeoutInput.value = String(config.timeoutMinutes);
  timeoutValue.textContent = `${config.timeoutMinutes} min`;
  testWebhookButton.disabled = !config.webhookUrl.trim();
}

function normalizeTimeoutMinutes(value: string): number {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return config.timeoutMinutes;
  }

  return Math.min(240, Math.max(5, Math.round(parsed)));
}

function syncFolderList(): void {
  const statusByPath = new Map(folders.map((folder) => [folder.label, folder]));

  folders = config.watchedFolders.map((folderPath) => {
    const existingFolder = statusByPath.get(folderPath);

    return {
      id: createFolderId(folderPath),
      label: folderPath,
      status: existingFolder?.status ?? "Watching",
      languageTag: existingFolder?.languageTag ?? null
    };
  });

  if (!folders.some((folder) => folder.id === selectedFolderId)) {
    selectedFolderId = folders[0]?.id ?? null;
  }
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
    const emptyDetail = config.watchedFolders.length
      ? "VibePing is running quietly in the background. Your latest events will show up here."
      : "No recent activity yet.";

    emptyState.className = "activity-item";
    emptyState.textContent = emptyDetail;
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

async function refreshState(): Promise<void> {
  if (!desktopApi?.getState) {
    return;
  }

  const snapshot = await desktopApi.getState();
  const statusByPath = new Map(snapshot.folders.map((folder) => [folder.path, folder.status]));
  const languageTagByPath = new Map(snapshot.folders.map((folder) => [folder.path, folder.languageTag]));

  folders = folders.map((folder) => ({
    ...folder,
    status: statusByPath.get(folder.label) ?? folder.status,
    languageTag: languageTagByPath.get(folder.label) ?? folder.languageTag
  }));
  activityItems = snapshot.activity.map(({ timestamp: _timestamp, ...activity }) => activity);

  renderDiscordStatus(snapshot.discord);
  renderFolders();
  renderActivity();
}

async function persistConfig(nextConfig: Partial<WatcherConfig>): Promise<void> {
  if (!desktopApi?.updateConfig) {
    return;
  }

  config = await desktopApi.updateConfig(nextConfig);
  syncFolderList();
  applyConfigToInputs();
}

function saveTimeoutMinutes(): void {
  const nextTimeoutMinutes = normalizeTimeoutMinutes(timeoutInput.value);
  timeoutInput.value = String(nextTimeoutMinutes);
  void persistConfig({ timeoutMinutes: nextTimeoutMinutes }).then(() => {
    setStatus("Idle threshold updated", `VibePing will mark you offline after ${nextTimeoutMinutes} minutes.`);
    return refreshState();
  });
}

function commitUsername(): void {
  const nextUsername = normalizeUsername(usernameInput.value);
  usernameInput.value = nextUsername;
  usernameDisplay.textContent = `@${nextUsername}`;
  usernameDisplay.classList.remove("is-hidden");
  usernameInput.classList.add("is-hidden");
  void persistConfig({ username: nextUsername }).then(() => refreshState());
}

function saveWebhook(): void {
  const nextWebhookUrl = webhookInput.value.trim();
  const validation = validateDiscordWebhookUrl(nextWebhookUrl);

  if (!validation.valid) {
    renderWebhookValidation();
    setStatus("Invalid webhook URL", validation.message);
    return;
  }

  void persistConfig({ webhookUrl: nextWebhookUrl }).then(() => {
    setStatus(
      nextWebhookUrl ? "Discord connected" : initialStatus.label,
      nextWebhookUrl
        ? "Discord webhook saved for future coding updates."
        : initialStatus.detail
    );
    return refreshState();
  });
}

async function testDiscordConnection(): Promise<void> {
  if (!desktopApi?.testDiscordConnection) {
    return;
  }

  const validation = validateDiscordWebhookUrl(webhookInput.value.trim());

  if (!validation.valid) {
    renderWebhookValidation();
    setStatus("Invalid webhook URL", validation.message);
    return;
  }

  testWebhookButton.disabled = true;
  testWebhookButton.textContent = "Testing...";

  try {
    const result = await desktopApi.testDiscordConnection();
    setStatus(
      result.delivered ? "Discord connection ready" : "Discord connection failed",
      result.message
    );
    await refreshState();
  } finally {
    testWebhookButton.textContent = "Test connection";
    testWebhookButton.disabled = !config.webhookUrl.trim();
  }
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

  const existingPaths = new Set(config.watchedFolders);
  const nextFolders = selectedPaths.filter((selectedPath) => !existingPaths.has(selectedPath));

  if (nextFolders.length === 0) {
    setStatus("No new folders added", "Those folders are already in the watch list.");
    return;
  }

  await persistConfig({
    watchedFolders: [...config.watchedFolders, ...nextFolders]
  });
  selectedFolderId = createFolderId(nextFolders.at(-1) ?? config.watchedFolders[0] ?? "");
  setStatus("Folders selected", `${nextFolders.length} folder${nextFolders.length === 1 ? "" : "s"} added to the watch list.`);
  await refreshState();
}

function removeSelectedFolder(): void {
  if (selectedFolderId === null) {
    return;
  }

  const selectedFolder = folders.find((folder) => folder.id === selectedFolderId);

  if (!selectedFolder) {
    return;
  }

  void persistConfig({
    watchedFolders: config.watchedFolders.filter((folderPath) => folderPath !== selectedFolder.label)
  }).then(() => refreshState());
}

async function bootstrap(): Promise<void> {
  if (!desktopApi?.runtime || !desktopApi?.getConfig || !desktopApi?.getState) {
    setStatus(
      "Desktop bridge unavailable",
      "The preload script did not initialize. Restart the app to load the Electron bridge."
    );
    return;
  }

  runtimeBadge.textContent = `Electron ${desktopApi.runtime.electron} • Node ${desktopApi.runtime.node} • ${desktopApi.platform}`;
  config = await desktopApi.getConfig();
  syncFolderList();
  applyConfigToInputs();
  renderWebhookValidation();
  renderFolders();
  renderActivity();
  await refreshState();
}

addFolderButton.addEventListener("click", () => {
  void addSelectedFolders();
});
removeFolderButton.addEventListener("click", removeSelectedFolder);
webhookInput.addEventListener("change", () => {
  saveWebhook();
});
webhookInput.addEventListener("input", () => {
  renderWebhookValidation();
  testWebhookButton.disabled = !webhookInput.value.trim();
});
webhookInput.addEventListener("blur", () => {
  saveWebhook();
});
testWebhookButton.addEventListener("click", () => {
  void testDiscordConnection();
});
keepRunningCheckbox.addEventListener("change", () => {
  void persistConfig({
    keepRunningInBackground: keepRunningCheckbox.checked
  });
});
openAtLoginCheckbox.addEventListener("change", () => {
  void persistConfig({
    openAtLogin: openAtLoginCheckbox.checked,
    startHidden: openAtLoginCheckbox.checked ? startHiddenCheckbox.checked : false
  });
});
startHiddenCheckbox.addEventListener("change", () => {
  void persistConfig({
    startHidden: openAtLoginCheckbox.checked && startHiddenCheckbox.checked
  });
});
timeoutInput.addEventListener("change", saveTimeoutMinutes);
timeoutInput.addEventListener("blur", saveTimeoutMinutes);
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
    usernameInput.value = config.username;
    usernameDisplay.classList.remove("is-hidden");
    usernameInput.classList.add("is-hidden");
  }
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    webhookInput.value = config.webhookUrl;
    timeoutInput.value = String(config.timeoutMinutes);
    testWebhookButton.disabled = !config.webhookUrl.trim();
  }
});

void bootstrap();
window.setInterval(() => {
  void refreshState();
}, 10_000);
