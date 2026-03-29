# Vibe-Ping

Vibe-Ping is a small desktop app that posts your coding presence to Discord.

Point it at one or more project folders, let it run in the background, and it will quietly tell your server when you are actively coding or when you're offline.

This repo is aimed at developers first: clone it, run it locally, connect a Discord webhook, and start experimenting.

Join the Vibe-Ping Discord community: [discord.gg/KBzRBRXR](https://discord.gg/KBzRBRXR)

## What It Does

- watches local project folders for recent file activity
- sends Discord webhook updates when coding starts
- marks you offline after an idle threshold
- keeps running after the window closes
- lives in the tray with explicit reopen and quit behavior
- supports launch at login and start hidden
- includes an in-app Discord connection test

## Quick Start

CHANGE TEST
### Requirements

- Node.js 18+
- pnpm
- macOS, Windows, or Linux with Electron support

### Install

If you do not already have `pnpm`, install it first.

Recommended on macOS, Windows, and Linux if your Node.js install includes `corepack`:

```bash
corepack enable
corepack prepare pnpm@10.6.0 --activate
```

If `corepack` is not available on your machine, use this fallback instead:

```bash
npm install -g pnpm@10.6.0
```

Then clone the repo and install its dependencies:

```bash
git clone https://github.com/justincoolio/vibe-ping.git
cd vibe-ping
pnpm install
```

`pnpm install` does not install Vibe-Ping system-wide. It installs the packages needed to run the app from this repository checkout.

### Run

```bash
pnpm test:app
```

That launches the Vibe-Ping app from your local clone.

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


## Notes

- Closing the window can keep Vibe-Ping running in the background.
- Quitting is handled explicitly from the tray menu.
- Discord webhooks are sensitive credentials. Keep them private.
