# VibePing

VibePing is a small desktop-first tool for spotting whether a project folder is active, quiet, or drifting offline.

Right now the project includes an Electron watcher app that can:

- let you choose folders to monitor
- scan those folders for recent file changes
- show recent activity in a compact desktop UI
- label folders as `Currently vibe coding` or `Offline` based on the timeout window

This repo is still early-stage, but the goal is simple: make project presence visible without turning the workflow into a heavy dashboard.

## Current status

The desktop watcher is the active part of the project today.

Implemented now:

- compact Electron desktop app
- folder picker for watched folders
- local activity scanning for recent file changes
- timeout-based live status in the UI

Planned next:

- persistent saved folders and settings
- stronger file watching behavior instead of scan-only refreshes
- backend/API and Discord notification flow

## Monorepo layout

```text
apps/
  watcher/   Electron desktop watcher
  backend/   Future API + notification service
packages/
  shared/    Shared types and constants
```

## Tech stack

- TypeScript monorepo
- Node.js runtime
- `pnpm` workspaces
- Electron for the desktop watcher

## Getting started

### Install

```bash
pnpm install
```

### Run the watcher app

```bash
pnpm --filter @vibeping/watcher start
```

### Typecheck

```bash
pnpm typecheck
```

### Build

```bash
pnpm build
```

## Notes for developers

- The watcher currently uses local folder scanning from the Electron main process.
- Recent activity is derived from file modification times inside selected folders.
- The app is intentionally small and utility-shaped rather than dashboard-shaped.
- No backend integration or Discord delivery is wired yet.

## Why the name?

Because sometimes you do not need a full analytics pipeline. You just need a quick signal that says: this folder still has a pulse.
