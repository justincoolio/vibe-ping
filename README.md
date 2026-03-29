# VibePing

VibePing is a desktop-first presence tool for developers.

Point it at a project folder, let it watch for recent file activity, and it can quietly post to Discord when you are actively coding.

The goal is simple: lightweight developer presence without turning your workflow into a giant dashboard.

## Version 1.0

VibePing v1 includes:

- a compact Electron desktop app
- local folder selection for watched projects
- recent-activity scanning based on file changes
- simple live status in the UI
- Discord webhook support
- backend delivery flow for presence updates
- local terminal logging for testing and debugging

Current Discord behavior is intentionally quiet:

- VibePing sends when a project becomes active
- when a watched project goes idle after 15 minutes, Discord receives `<username> offline.`
- the desktop app notifies locally when a watched project has been idle for 15 minutes
- it does not spam repeated offline notifications
- the watcher can still show local state changes in the app

## How It Works

1. You add a folder in the desktop watcher.
2. VibePing scans for recent file activity in that folder.
3. If the folder is active, the watcher marks it as `Currently vibe coding`.
4. The watcher sends a presence update to the backend.
5. The backend forwards that update to Discord through your webhook.

## Monorepo Layout

```text
apps/
  watcher/   Electron desktop app for folder monitoring
  backend/   Presence update receiver + Discord delivery
packages/
  shared/    Shared types and contracts
config/
  tsconfig.base.json
```

## Tech Stack

- TypeScript
- Node.js
- `pnpm` workspaces
- Electron

## Getting Started

### Install

```bash
pnpm install
```

### Run Everything For Testing

```bash
pnpm test:app
```

That starts the backend and launches the watcher app together.

### Run Pieces Separately

Backend:

```bash
pnpm test:backend
```

Watcher:

```bash
pnpm test:watcher
```

## Build And Typecheck

```bash
pnpm typecheck
pnpm build
```

## Discord Setup

Inside the watcher app:

1. Paste a Discord webhook URL into the Discord section.
2. Add a folder to watch.
3. Start working in that folder.

VibePing validates the webhook format locally before using it.

## What The Watcher Does Today

- tracks selected folders locally
- scans for recent file updates
- shows recent activity in the app
- updates status based on recent activity
- sends presence updates through the backend

## Notes

- The watcher currently uses scan-based activity detection, not true OS-level file watching.
- Discord delivery uses webhooks, so keep those URLs private.
- The app is intentionally small, focused, and utility-shaped.

## Why VibePing?

Because sometimes the right status message is just:

`someone is vibe coding right now`
