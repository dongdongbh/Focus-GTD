<div align="center">

<img src="apps/mobile/assets/images/icon.png" width="120" alt="Focus GTD Logo">

# Focus GTD

A complete Getting Things Done (GTD) productivity system for desktop and mobile.

*New to GTD? Read [GTD in 15 minutes](https://hamberg.no/gtd) for a quick introduction.*

[![CI](https://github.com/dongdongbh/Focus-GTD/actions/workflows/ci.yml/badge.svg)](https://github.com/dongdongbh/Focus-GTD/actions/workflows/ci.yml)
[![GitHub stars](https://img.shields.io/github/stars/dongdongbh/Focus-GTD?style=social)](https://github.com/dongdongbh/Focus-GTD/stargazers)
[![GitHub license](https://img.shields.io/github/license/dongdongbh/Focus-GTD)](LICENSE)
[![GitHub last commit](https://img.shields.io/github/last-commit/dongdongbh/Focus-GTD)](https://github.com/dongdongbh/Focus-GTD/commits/main)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://github.com/dongdongbh/Focus-GTD/pulls)
[![Sponsor](https://img.shields.io/static/v1?label=Sponsor&message=%E2%9D%A4&logo=GitHub&color=%23fe8e86)](https://github.com/sponsors/dongdongbh)


</div>

## Features

### GTD Workflow
- **Capture** - Quick add tasks to Inbox from anywhere
- **Clarify** - Guided inbox processing with 2-minute rule
- **Organize** - Projects, contexts, and status lists
- **Reflect** - Weekly review wizard
- **Engage** - Context-filtered next actions

### Views
- 📥 **Inbox** - Capture zone with processing wizard
- ▶️ **Next Actions** - Context-filtered actionable tasks
- 📁 **Projects** - Multi-step outcomes
- 🏷️ **Contexts** - @home, @work, @errands, etc.
- ⏳ **Waiting For** - Delegated items
- 💭 **Someday/Maybe** - Deferred ideas
- 📅 **Calendar** - Time-based planning
- 📋 **Weekly Review** - Guided GTD review

### Data & Sync
- 🔄 **File-based Sync** - Sync folder support (Dropbox, Syncthing, etc.)
- 🔀 **Merge Strategy** - Smart merge prevents data loss
- 🗑️ **Soft Delete** - Deleted items sync properly across devices
- 📤 **Export/Backup** - Export data to JSON

### Cross-Platform
- 🖥️ **Desktop** - Tauri v2 app (macOS, Linux, Windows)
- 📱 **Mobile** - React Native/Expo (iOS, Android) with Smart Tags & Swipe Actions
- 🌍 **i18n** - English and Chinese language support
- 🔄 **Shared Core** - Same data model and business logic

## Installation

### Desktop (Linux)

**Arch Linux (AUR):**
```bash
# Using yay
yay -S focus-gtd-bin

# Using paru
paru -S focus-gtd-bin
```
📦 [AUR Package](https://aur.archlinux.org/packages/focus-gtd-bin)

**Debian/Ubuntu:**
Download the `.deb` from [GitHub Releases](https://github.com/dongdongbh/Focus-GTD/releases) and install:
```bash
sudo dpkg -i focus-gtd_*.deb
```

**AppImage (Universal):**
Download the `.AppImage` from [GitHub Releases](https://github.com/dongdongbh/Focus-GTD/releases):
```bash
chmod +x Focus.GTD_*.AppImage
./Focus.GTD_*.AppImage
```

### Mobile

**Android:**
Download the APK from [GitHub Releases](https://github.com/dongdongbh/Focus-GTD/releases).

**iOS:**
Coming soon via TestFlight.

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
Focus-GTD/
├── apps/
│   ├── desktop/     # Tauri v2 + React + Vite
│   └── mobile/      # Expo + React Native + NativeWind
├── packages/
│   └── core/        # Shared business logic (Zustand store)
└── package.json     # Monorepo root
```

## Tech Stack

| Layer     | Desktop          | Mobile                |
| --------- | ---------------- | --------------------- |
| Framework | React + Vite     | React Native + Expo   |
| Styling   | Tailwind CSS     | NativeWind (Tailwind) |
| State     | Zustand (shared) | Zustand (shared)      |
| Platform  | Tauri v2 (Rust)  | iOS/Android           |

## Data & Sync

Tasks and projects are stored locally:
- **Desktop**: `~/.config/focus-gtd/data.json` (sync folder: `~/Sync/focus-gtd/`)
- **Mobile**: AsyncStorage

Optional sync folder (e.g., Dropbox, Syncthing) can be configured in Settings for cross-device sync.

## Apps

- [Desktop README](apps/desktop/README.md)
- [Mobile Setup Guide](apps/mobile/MOBILE_SETUP.md)

## Roadmap

- [ ] 🔔 **Notifications/Reminders** - Mobile push notifications for due tasks
- [ ] 📱 **Android Widget** - Agenda widget using [react-native-android-widget](https://github.com/nickhudkins/react-native-android-widget)
- [ ] ☁️ **Cloud Sync** - Optional cloud-based sync service
- [ ] 🌐 **Web App** - Browser-based version

## License

MIT
