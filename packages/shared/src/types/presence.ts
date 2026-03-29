export type PresenceState = "Currently vibe coding" | "Offline";

export type PresenceUpdate = {
  username: string;
  projectName: string;
  folderPath: string;
  status: PresenceState;
  timestamp: string;
  languageTag?: string;
};
