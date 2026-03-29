# VibePing v1.0 GitHub Release Checklist

This checklist tracks the must-have work for a trustworthy GitHub-first developer release.

## Release Goal

Someone should be able to clone the repo, run VibePing locally, connect Discord, understand what the app is doing, and trust that it will not silently fail or spam bad updates.

## Must-Have Checklist

- [x] Background app lifecycle
  - Hide on close
  - Tray reopen and explicit quit
  - Persistent config across restarts
- [x] Launch controls
  - Launch at login
  - Start hidden
  - Editable idle/offline threshold
- [ ] Discord connection confidence
  - [x] Dedicated Discord connection section in the UI
  - [x] Test webhook action
  - [x] Visible connection status
  - [x] Visible last delivery result
  - [x] Clear failure messaging in the app
- [ ] Monitoring reliability
  - [ ] Graceful handling for missing or unreadable watched folders
  - [ ] Stable active/offline transitions without duplicate spam
  - [ ] Clear documentation for scan-based watching limitations
- [ ] In-app diagnostics
  - [ ] Last scan time
  - [ ] Current effective presence state
  - [ ] Last successful Discord send time
- [ ] Core test coverage
  - [ ] Presence transition behavior
  - [ ] Idle threshold behavior
  - [ ] Discord payload formatting
  - [ ] Duplicate-send prevention
- [ ] Release-quality docs
  - [ ] Setup steps from clone to running app
  - [ ] Discord webhook setup instructions
  - [ ] Explanation of close vs quit
  - [ ] Known limitations section

## Next Recommended Order

1. Finish Discord connection confidence.
2. Add in-app diagnostics.
3. Harden folder and watcher edge cases.
4. Add core tests around state transitions and Discord delivery.
5. Polish README for a GitHub dev release.
