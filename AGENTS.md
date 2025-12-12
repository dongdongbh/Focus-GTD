# Repository Guidelines

## Project Structure & Module Organization
- Monorepo using Bun workspaces. Core directories: `apps/desktop` (Tauri + React + Vite), `apps/mobile` (Expo React Native), `packages/core` (shared Zustand models + storage adapters), and `scripts/` for release helpers.
- Frontend assets live in each app’s `public`/`assets` folders. Shared types and stores come from `packages/core/src`.
- Desktop tests typically sit beside components (e.g., `TaskItem.test.tsx`), while mobile tests are minimal and should be added under `apps/mobile/__tests__` or colocated.

## Build, Test, and Development Commands
```bash
bun install                   # install all workspace deps
bun desktop:dev               # run Tauri desktop app in dev
bun desktop:build             # production desktop bundle
bun run --filter gtd-todo-app lint   # desktop lint (ESLint)
bun run --filter gtd-todo-app test   # desktop unit/component tests (Vitest)
bun mobile:start              # start Expo dev server
bun mobile:android | ios      # launch Expo on emulator/simulator
```
Run commands from the repo root. Tauri builds require Rust toolchain + system webview libs; Expo needs Android/iOS tooling or Expo Go.

## Coding Style & Naming Conventions
- TypeScript-first; prefer functional React components with hooks. Use 4-space indent and keep imports sorted logically (external, workspace, relative).
- Components and context providers use `PascalCase`, hooks `useSomething`, utility modules kebab-case (e.g., `storage-adapter.ts`). Tests mirror the module name with `.test.tsx`.
- Styling: Tailwind CSS in desktop, NativeWind in mobile. Keep utility classes readable (group by layout, spacing, color).
- Lint with project configs before pushing; avoid disabling rules unless justified inline.

## Testing Guidelines
- Desktop: Vitest + Testing Library. Favor accessibility-centric queries (`getByRole`, `getByLabelText`). Cover new UI states and shared store changes; add fixture data under the relevant view folder when useful.
- Mobile: Automated coverage is light—add Jest/Testing Library tests for new hooks or utilities and sanity checks for critical screens. Document any manual test steps for device-specific behavior.

## Commit & Pull Request Guidelines
- Follow Conventional Commits as seen in history (`feat:`, `fix:`, `chore:`, optional scopes like `feat(mobile): ...`). Keep subjects imperative and under ~72 characters.
- PRs should include: concise summary, linked issue (if any), test evidence (commands run + results), and screenshots/recordings for UI changes. Note platform impact (desktop/mobile/both) and any migration or data considerations.

## Environment & Configuration Tips
- Desktop data persists under `~/.config/tech.dongdongbh.mindwtr/` (platform equivalents on macOS/Windows); avoid committing sample data.
- Set Android SDK paths when working on mobile (`ANDROID_HOME`, `PATH` updates). Keep API keys or signing material out of the repo; use local env files or CI secrets.
