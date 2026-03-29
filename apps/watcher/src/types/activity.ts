export type FolderItem = {
  id: string;
  label: string;
  status: "Watching" | "Idle" | "Needs review";
  languageTag: string | null;
};

export type ActivityItem = {
  id: string;
  title: string;
  detail: string;
  time: string;
};

export type PresenceState = "Currently vibe coding" | "Offline";
