# Mindwtr Desktop

Tauri v2 desktop app for the Mindwtr productivity system.

## Features

### GTD Workflow
- **Inbox Processing** - Guided clarify workflow with 2-minute rule
- **Context Filtering** - Filter tasks by @home, @work, @errands, etc.
- **Weekly Review** - Step-by-step GTD review wizard
- **Board View** - Kanban-style drag-and-drop
- **Calendar View** - Time-based task planning

### Views
| View          | Description                        |
| ------------- | ---------------------------------- |
| Inbox         | Capture and process incoming items |
| Next Actions  | Context-filtered actionable tasks  |
| Projects      | Multi-step outcomes with tasks     |
| Contexts      | Filter by location/tool            |
| Waiting For   | Delegated items                    |
| Someday/Maybe | Deferred ideas                     |
| Calendar      | Time-based view                    |
| Review        | Weekly review wizard               |
| Settings      | Theme, sync, and preferences       |

## Tech Stack

- **Frontend**: React + TypeScript + Vite
- **Styling**: Tailwind CSS
- **State**: Zustand (shared with mobile)
- **Platform**: Tauri v2 (Rust backend, WebKitGTK)
- **Drag & Drop**: @dnd-kit

### Why Tauri?
- 🚀 **Small binary** (~5MB vs ~150MB for Electron)
- 💾 **Low memory** (~50MB vs ~300MB for Electron)
- 🦀 **Rust backend** for fast file operations
- 🖥️ **Native dialogs** via system webview

## Prerequisites

- [Rust](https://rustup.rs/) (for building Tauri)
- [Bun](https://bun.sh/) (package manager)

### Arch Linux
```bash
sudo pacman -S rust webkit2gtk-4.1 base-devel
```

## Getting Started

```bash
# From monorepo root
bun install

# Run desktop app (dev mode)
cd apps/desktop
bun dev

# Or from root
bun desktop:dev
```

## Building

```bash
# Build for distribution
bun run build

# Output in src-tauri/target/release/
```

## Data Storage

Tasks are saved to:
- **Linux**: `~/.config/mindwtr/data.json`
- **macOS**: `~/Library/Application Support/mindwtr/data.json`
- **Windows**: `%APPDATA%/mindwtr/data.json`

## Sync

Configure a sync folder in Settings to sync data with Dropbox, Syncthing, or any folder-based sync service.

## Testing

```bash
bun run test
```

Includes unit tests, component tests, and accessibility tests.
