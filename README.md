<div align="center">

<img src="apps/mobile/assets/images/icon.png" width="120" alt="Mindwtr Logo">

# Mindwtr

A complete Getting Things Done (GTD) productivity system for desktop and mobile. *Mind Like Water.*

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
yay -S mindwtr-bin

# Using paru
paru -S mindwtr-bin
```
📦 [AUR Package](https://aur.archlinux.org/packages/mindwtr-bin)

**Debian/Ubuntu:**
Download the `.deb` from [GitHub Releases](https://github.com/dongdongbh/Focus-GTD/releases) and install:
```bash
sudo dpkg -i mindwtr_*.deb
```

**AppImage (Universal):**
Download the `.AppImage` from [GitHub Releases](https://github.com/dongdongbh/Focus-GTD/releases):
```bash
chmod +x Mindwtr_*.AppImage
./Mindwtr_*.AppImage
```

### Desktop (Windows)
Download the installer (`.msi` or `.exe`) from [GitHub Releases](https://github.com/dongdongbh/Focus-GTD/releases) and run it.

### Desktop (macOS)
Download the disk image (`.dmg`) from [GitHub Releases](https://github.com/dongdongbh/Focus-GTD/releases), open it, and drag the application to your Applications folder.

### Mobile

**Android:**
Download the APK from [GitHub Releases](https://github.com/dongdongbh/Focus-GTD/releases).

**iOS:**
iOS builds require an Apple Developer account ($99/year). Currently available as simulator builds only.

## Data Storage

Tasks and projects are stored locally on your device:
- **Desktop**: `~/.config/mindwtr/data.json`
- **Mobile**: Device storage (AsyncStorage)

Optional sync via Dropbox, Syncthing, or similar can be configured in Settings.

## Development

For developers, see the [Development Guide](docs/development.md).

## Roadmap

- [ ] 🔔 **Notifications/Reminders** - Mobile push notifications for due tasks
- [ ] 📱 **Android Widget** - Agenda widget for home screen
- [ ] ☁️ **Cloud Sync** - Optional cloud-based sync service
- [ ] 🌐 **Web App** - Browser-based version

## License

MIT
