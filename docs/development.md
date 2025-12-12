# Development Guide

This document covers development setup and project structure for contributors.

## Quick Start

```bash
# Install dependencies
bun install

# Run desktop app
bun desktop:dev

# Run mobile app
bun mobile:start
```

## Project Structure

```
Mindwtr/
├── apps/
│   ├── desktop/     # Tauri v2 + React + Vite
│   └── mobile/      # Expo + React Native + NativeWind
├── packages/
│   └── core/        # Shared business logic (Zustand store)
├── docs/            # Documentation
└── package.json     # Monorepo root
```

## Tech Stack

| Layer     | Desktop          | Mobile                |
| --------- | ---------------- | --------------------- |
| Framework | React + Vite     | React Native + Expo   |
| Styling   | Tailwind CSS     | NativeWind (Tailwind) |
| State     | Zustand (shared) | Zustand (shared)      |
| Platform  | Tauri v2 (Rust)  | iOS/Android           |

## Data Storage

Tasks and projects are stored locally:
- **Desktop**: `~/.config/mindwtr/data.json`
- **Mobile**: AsyncStorage

Optional sync folder (e.g., Dropbox, Syncthing) can be configured in Settings for cross-device sync.
Default sync folder: `~/Sync/mindwtr/`

## App READMEs

- [Desktop App](../apps/desktop/README.md)
- [Mobile App](../apps/mobile/README.md)

## Additional Documentation

- [Mobile URL Polyfill](mobile-url-polyfill.md) - Critical polyfill documentation
- [GTD Best Practices](gtd-best-practices.md) - GTD methodology reference
