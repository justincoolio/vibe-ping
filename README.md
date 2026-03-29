# Vibe-Ping

Vibe-Ping is a small desktop app that posts your coding presence to Discord.

Point it at one or more project folders, let it run in the background, and it will quietly tell your server when you are actively coding or when you're offline.

This repo is aimed at developers first: clone it, run it locally, connect a Discord webhook, and start experimenting.

## Why It Exists

Most presence tools are built around chat apps, game launchers, or giant collaboration suites.

Vibe-Ping is intentionally narrower:

- desktop-first
- Discord-focused
- low-friction
- background-friendly
- built for developers who just want lightweight “I’m coding right now” signals

## What It Does

- watches local project folders for recent file activity
- sends Discord webhook updates when coding starts
- marks you offline after an idle threshold
- keeps running after the window closes
- lives in the tray with explicit reopen and quit behavior
- supports launch at login and start hidden
- includes an in-app Discord connection test

## Quick Start

### Requirements

- Node.js
- `pnpm`
- macOS, Windows, or Linux with Electron support

### Install

```bash
pnpm install
```

### Run

```bash
pnpm test:app
```

That launches the Vibe-Ping app.

### Inside The App

1. Add your Discord webhook.
2. Click `Test connection`.
3. Add a folder to watch.
4. Start coding.

## Development Commands

Run the app:

```bash
pnpm test:app
```

Run the watcher directly:

```bash
pnpm test:watcher
```

Typecheck everything:

```bash
pnpm typecheck
```

Build everything:

```bash
pnpm build
```

## How It Works

Vibe-Ping scans watched folders for recent file changes.

If activity is fresh, it reports `Currently vibe coding`.

If activity stays quiet past the configured threshold, it reports `Offline`.

The monitoring loop lives in Electron’s main process, so the app can keep running even after the window is closed.

## Current Scope

This is a GitHub-first developer release, not a polished packaged consumer app yet.

What is solid today:

- local folder monitoring
- Discord webhook delivery
- background app behavior
- tray-based lifecycle
- editable idle threshold
- launch-at-login controls

What is still intentionally simple:

- file activity uses scan-based detection, not native OS file watching
- distribution is still repo-first

## Repo Layout

```text
apps/
  watcher/   Electron app for monitoring + Discord delivery
  backend/   Legacy prototype code
packages/
  shared/    Shared types
docs/
  v1-github-release-checklist.md
```

## Notes

- Closing the window can keep Vibe-Ping running in the background.
- Quitting is handled explicitly from the tray menu.
- Discord webhooks are sensitive credentials. Keep them private.
