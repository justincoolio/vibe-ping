import { readdir, stat } from "node:fs/promises";
import path from "node:path";

export type FolderStatus = "Watching" | "Idle" | "Needs review";

export type WatchedFolderSnapshot = {
  path: string;
  status: FolderStatus;
  lastActivityAt: number | null;
  languageTag: string | null;
};

export type RecentActivityEntry = {
  id: string;
  title: string;
  detail: string;
  time: string;
  timestamp: number;
};

type ScanOptions = {
  timeoutMinutes: number;
  maxEntries?: number;
  maxDepth?: number;
};

type FileActivity = {
  filePath: string;
  modifiedAt: number;
};

type LanguageDefinition = {
  tag: string;
  extensions: string[];
  filenames?: string[];
};

type FileScanResult = {
  recentActivity: FileActivity[];
  languageTag: string | null;
};

const SKIPPED_DIRECTORIES = new Set([
  ".git",
  "node_modules",
  "dist",
  "build",
  ".turbo",
  ".cache"
]);

const LANGUAGE_DEFINITIONS: LanguageDefinition[] = [
  {
    tag: "#typescript",
    extensions: [".ts", ".tsx", ".mts", ".cts"],
    filenames: ["tsconfig.json"]
  },
  {
    tag: "#javascript",
    extensions: [".js", ".jsx", ".mjs", ".cjs"],
    filenames: ["package.json"]
  },
  {
    tag: "#python",
    extensions: [".py", ".pyw"]
  },
  {
    tag: "#swift",
    extensions: [".swift"]
  },
  {
    tag: "#html",
    extensions: [".html", ".htm"]
  },
  {
    tag: "#css",
    extensions: [".css", ".scss", ".sass", ".less"]
  },
  {
    tag: "#java",
    extensions: [".java"]
  },
  {
    tag: "#go",
    extensions: [".go"]
  },
  {
    tag: "#rust",
    extensions: [".rs"]
  },
  {
    tag: "#ruby",
    extensions: [".rb"]
  },
  {
    tag: "#php",
    extensions: [".php"]
  },
  {
    tag: "#kotlin",
    extensions: [".kt", ".kts"]
  },
  {
    tag: "#csharp",
    extensions: [".cs"]
  }
];

export async function scanWatchedFolders(
  watchedFolders: string[],
  options: ScanOptions
): Promise<{
  folders: WatchedFolderSnapshot[];
  activity: RecentActivityEntry[];
}> {
  const allActivity = await Promise.all(
    watchedFolders.map(async (folderPath) => {
      const scanResult = await collectRecentFiles(folderPath, {
        maxEntries: options.maxEntries ?? 40,
        maxDepth: options.maxDepth ?? 4
      });

      const latest = scanResult.recentActivity[0]?.modifiedAt ?? null;

      return {
        folderPath,
        latest,
        ...scanResult
      };
    })
  );

  const now = Date.now();
  const timeoutMs = options.timeoutMinutes * 60 * 1000;

  const folders = allActivity.map<WatchedFolderSnapshot>((folder) => ({
    path: folder.folderPath,
    lastActivityAt: folder.latest,
    status: getFolderStatus(folder.latest, now, timeoutMs),
    languageTag: folder.languageTag
  }));

  const activity = allActivity
    .flatMap((folder) =>
      folder.recentActivity.map<RecentActivityEntry>((entry) => ({
        id: `${entry.filePath}-${entry.modifiedAt}`,
        title: path.basename(entry.filePath),
        detail: `${path.basename(folder.folderPath)} • ${entry.filePath}`,
        time: formatRelativeTime(entry.modifiedAt, now),
        timestamp: entry.modifiedAt
      }))
    )
    .sort((left, right) => right.timestamp - left.timestamp)
    .slice(0, 8);

  return { folders, activity };
}

async function collectRecentFiles(
  rootPath: string,
  options: {
    maxEntries: number;
    maxDepth: number;
  }
): Promise<FileScanResult> {
  const results: FileActivity[] = [];
  let scannedEntries = 0;
  const languageScores = new Map<string, number>();

  async function walk(currentPath: string, depth: number): Promise<void> {
    if (depth > options.maxDepth || scannedEntries >= options.maxEntries) {
      return;
    }

    let entries;

    try {
      entries = await readdir(currentPath, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (scannedEntries >= options.maxEntries) {
        return;
      }

      const fullPath = path.join(currentPath, entry.name);

      if (entry.isDirectory()) {
        if (SKIPPED_DIRECTORIES.has(entry.name)) {
          continue;
        }

        await walk(fullPath, depth + 1);
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      scannedEntries += 1;

      try {
        const fileStat = await stat(fullPath);
        updateLanguageScores(languageScores, entry.name, fullPath);
        results.push({
          filePath: fullPath,
          modifiedAt: fileStat.mtimeMs
        });
      } catch {
        continue;
      }
    }
  }

  await walk(rootPath, 0);

  return {
    recentActivity: results.sort((left, right) => right.modifiedAt - left.modifiedAt).slice(0, 6),
    languageTag: selectPrimaryLanguage(languageScores)
  };
}

function updateLanguageScores(
  scores: Map<string, number>,
  fileName: string,
  filePath: string
): void {
  const extension = path.extname(filePath).toLowerCase();
  const normalizedFileName = fileName.toLowerCase();

  for (const language of LANGUAGE_DEFINITIONS) {
    let scoreDelta = 0;

    if (language.extensions.includes(extension)) {
      scoreDelta += 1;
    }

    if (language.filenames?.includes(normalizedFileName)) {
      scoreDelta += 2;
    }

    if (scoreDelta > 0) {
      scores.set(language.tag, (scores.get(language.tag) ?? 0) + scoreDelta);
    }
  }
}

function selectPrimaryLanguage(scores: Map<string, number>): string | null {
  let strongestTag: string | null = null;
  let strongestScore = 0;

  for (const language of LANGUAGE_DEFINITIONS) {
    const score = scores.get(language.tag) ?? 0;

    if (score > strongestScore) {
      strongestScore = score;
      strongestTag = language.tag;
    }
  }

  return strongestTag;
}

function getFolderStatus(
  latestActivityAt: number | null,
  now: number,
  timeoutMs: number
): FolderStatus {
  if (latestActivityAt === null) {
    return "Needs review";
  }

  if (now - latestActivityAt <= timeoutMs) {
    return "Watching";
  }

  return "Idle";
}

function formatRelativeTime(timestamp: number, now: number): string {
  const diffMs = Math.max(0, now - timestamp);
  const diffMinutes = Math.floor(diffMs / (60 * 1000));

  if (diffMinutes < 1) {
    return "just now";
  }

  if (diffMinutes < 60) {
    return `${diffMinutes} min ago`;
  }

  const diffHours = Math.floor(diffMinutes / 60);

  if (diffHours < 24) {
    return `${diffHours} hr ago`;
  }

  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays} day${diffDays === 1 ? "" : "s"} ago`;
}
