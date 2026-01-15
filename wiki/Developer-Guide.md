# Developer Guide

This guide covers development setup and contribution guidelines for Mindwtr.

---

## Quick Start

```bash
# Clone repository
git clone https://github.com/dongdongbh/Mindwtr.git
cd Mindwtr

# Install dependencies
bun install

# Run desktop app (dev mode)
bun desktop:dev

# Run mobile app
bun mobile:start
```

---

## Prerequisites

### All Platforms

- [Bun](https://bun.sh/) — Package manager and runtime
- [Node.js](https://nodejs.org/) — JavaScript runtime (for some tools)
- [Git](https://git-scm.com/) — Version control

### Desktop Development

- [Rust](https://rustup.rs/) — Required for Tauri

**Linux (Arch):**
```bash
sudo pacman -S rust webkit2gtk-4.1 base-devel
```

**Linux (Debian/Ubuntu):**
```bash
sudo apt install libwebkit2gtk-4.1-dev build-essential libssl-dev libgtk-3-dev
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

**macOS:**
```bash
xcode-select --install
brew install rust
```

**Windows:**
Install [Rust](https://rustup.rs/) and [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/).

### Mobile Development

- [Expo Go](https://expo.dev/client) app (for testing)
- Android Studio (for emulator/device builds)
- Xcode (for iOS development)

---

## Project Structure

```
Mindwtr/
├── apps/
│   ├── cloud/             # Sync server (Bun)
│   ├── desktop/           # Tauri v2 + React + Vite
│   │   ├── src/           # React source
│   │   │   ├── components/
│   │   │   ├── contexts/
│   │   │   ├── lib/
│   │   │   └── App.tsx
│   │   ├── src-tauri/     # Rust backend
│   │   └── package.json
│   │
│   └── mobile/            # Expo + React Native
│       ├── app/           # Expo Router pages
│       ├── components/
│       ├── contexts/
│       ├── lib/
│       └── package.json
│
├── packages/
│   └── core/              # Shared business logic
│       └── src/
│           ├── store.ts   # Zustand store
│           ├── types.ts   # TypeScript types
│           ├── i18n.ts    # Translations
│           └── ...
│
├── scripts/               # Utility scripts (CLI, API, release)
├── docs/                  # Documentation
├── wiki/                  # Wiki source
├── .github/               # CI/CD workflows
└── package.json           # Monorepo root
```

---

## Available Scripts

### Root Level

| Command              | Description              |
| -------------------- | ------------------------ |
| `bun install`        | Install all dependencies |
| `bun desktop:dev`    | Run desktop in dev mode  |
| `bun mobile:start`   | Start Expo dev server    |
| `bun mobile:android` | Run on Android           |
| `bun mobile:ios`     | Run on iOS               |
| `bun test`           | Run all tests            |
| `bun mindwtr:cli`    | Run CLI tool             |
| `bun mindwtr:api`    | Run local API server     |

### Desktop (`apps/desktop`)

| Command     | Description              |
| ----------- | ------------------------ |
| `bun dev`   | Dev mode with hot reload |
| `bun build` | Build for production     |
| `bun test`  | Run tests                |

### Mobile (`apps/mobile`)

| Command         | Description       |
| --------------- | ----------------- |
| `bun start`     | Start Expo server |
| `bun android`   | Run on Android    |
| `bun ios`       | Run on iOS        |
| `bun build:apk` | Build Android APK |

### Cloud (`apps/cloud`)

| Command   | Description     |
| --------- | --------------- |
| `bun dev` | Run sync server |

### Core (`packages/core`)

| Command     | Description    |
| ----------- | -------------- |
| `bun test`  | Run unit tests |
| `bun build` | Build package  |

---

## Tech Stack

| Layer         | Desktop          | Mobile                | Cloud            |
| ------------- | ---------------- | --------------------- | ---------------- |
| **Framework** | React + Vite     | React Native + Expo   | Bun (Native HTTP)|
| **Styling**   | Tailwind CSS     | NativeWind (Tailwind) | N/A              |
| **State**     | Zustand (shared) | Zustand (shared)      | N/A              |
| **Platform**  | Tauri v2 (Rust)  | Expo (iOS/Android)    | Bun              |
| **Router**    | React Router     | Expo Router           | N/A              |
| **Language**  | TypeScript       | TypeScript            | TypeScript       |

---

## Development Workflow

### Making Changes

1. Create a feature branch
2. Make changes in the relevant package
3. Run tests: `bun test`
4. Test on desktop: `bun desktop:dev`
5. Test on mobile: `bun mobile:start`
6. Commit with descriptive message
7. Open a pull request

### Code Style

- TypeScript for all code
- Functional React components
- Named exports preferred
- JSDoc comments for public APIs

### Testing

```bash
# Run all tests
bun test

# Run desktop tests
cd apps/desktop && bun test

# Run core tests
cd packages/core && bun test
```

---

## Building for Production

### Desktop

```bash
cd apps/desktop
bun run build
# Output: src-tauri/target/release/
```

### Mobile (Android APK)

```bash
cd apps/mobile
ARCHS=arm64-v8a bash ./scripts/android_build.sh
```

See [[Mobile Installation]] for detailed build instructions.

---

## Architecture Overview

See [[Architecture]] for detailed technical design.

### Key Concepts

- **Monorepo:** Single repo with shared dependencies
- **Shared Core:** Business logic in `@mindwtr/core`
- **Platform Apps:** Desktop and Mobile use the shared core
- **Local Storage:** Data persisted locally
- **Multiple Sync:** File, WebDAV, or Cloud sync

---

## CLI Tool

Command-line interface for scripting and automation:

```bash
# Add a task
bun mindwtr:cli -- add "Call mom @phone #family"

# List active tasks
bun mindwtr:cli -- list

# List with filters
bun mindwtr:cli -- list --status next --query "due:<=7d"

# Complete a task
bun mindwtr:cli -- complete <taskId>

# Search
bun mindwtr:cli -- search "@work"
```

**Options:**
- `--data <path>` — Override data.json location
- `MINDWTR_DATA` — Environment variable for data path

---

## Local REST API

Run a local API server for scripting and integrations:

```bash
# Start API server
bun mindwtr:api -- --port 4317

# With auth token
MINDWTR_API_TOKEN=secret bun mindwtr:api -- --port 4317
```

### Endpoints

| Method   | Endpoint              | Description           |
| -------- | --------------------- | --------------------- |
| `GET`    | `/health`             | Health check          |
| `GET`    | `/tasks`              | List tasks            |
| `GET`    | `/tasks?status=next`  | Filter by status      |
| `GET`    | `/tasks?query=@work`  | Search tasks          |
| `POST`   | `/tasks`              | Create task           |
| `PATCH`  | `/tasks/:id`          | Update task           |
| `DELETE` | `/tasks/:id`          | Soft delete task      |
| `POST`   | `/tasks/:id/complete` | Mark task done        |
| `GET`    | `/projects`           | List projects         |
| `GET`    | `/search?query=...`   | Search tasks+projects |

**Example:**
```bash
# Add task via API
curl -X POST http://localhost:4317/tasks \
  -H "Content-Type: application/json" \
  -d '{"input": "Review PR @work /due:tomorrow"}'

# Complete task
curl -X POST http://localhost:4317/tasks/<id>/complete
```

---

## Cloud Server

Self-hosted cloud sync backend:

```bash
# From monorepo root
bun run --filter mindwtr-cloud dev -- --port 8787
```

### Endpoints

| Method | Endpoint   | Description    |
| ------ | ---------- | -------------- |
| `GET`  | `/health`  | Health check   |
| `GET`  | `/v1/data` | Get user data  |
| `PUT`  | `/v1/data` | Save user data |

**Authentication:** `Authorization: Bearer <token>`

Each token gets its own data file (SHA-256 hashed filename).

**Environment:**
- `PORT` — Server port (default 8787)
- `HOST` — Bind address (default 0.0.0.0)
- `MINDWTR_CLOUD_DATA_DIR` — Data directory

---

## Web App (PWA)

Run the desktop UI in a browser with PWA support:

```bash
# Development
bun desktop:web

# Production build
bun desktop:web:build
```

Uses localStorage for data storage and includes offline support via service worker.

---

## See Also

- [[Architecture]]
- [[Core API]]
- [[Contributing]]