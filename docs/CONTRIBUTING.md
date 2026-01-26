# Contributing

Thanks for helping improve Mindwtr! This project is a Bun monorepo with desktop (Tauri), mobile (Expo), and shared core packages.

## Code of Conduct
Please read and follow the [Code of Conduct](../CODE_OF_CONDUCT.md).

## Setup
Run commands from the repo root.

```bash
bun install
```

## Development

### Desktop
```bash
bun desktop:dev
```

### Mobile
```bash
bun mobile:start
```

## Testing

```bash
# Desktop tests (Vitest)
bun run --filter mindwtr test

# Core tests (Vitest)
bun run --filter @mindwtr/core test
```

## Linting

```bash
bun run --filter mindwtr lint
```

## Code Style
- TypeScript-first, functional React components with hooks.
- Keep imports grouped (external → workspace → relative).
- Match local file indentation (desktop/core: 4 spaces, mobile: 2 spaces).
- Prefer accessibility-friendly queries in tests (`getByRole`, `getByLabelText`).

## Git Workflow
- Branch naming: `feature/...` or `fix/...`
- Commit messages: Conventional Commits (`feat:`, `fix:`, `chore:`), optional scopes (`feat(mobile): ...`)
- Keep commits focused and avoid unrelated changes.

## PR Checklist
- Explain *what* and *why* in the PR description.
- Include test evidence (commands + results).
- Add screenshots/recordings for UI changes.
- Note platform impact (desktop/mobile/both).

## Further Reading
- Developer Guide: https://github.com/dongdongbh/Mindwtr/wiki/Developer-Guide
- Architecture: https://github.com/dongdongbh/Mindwtr/wiki/Architecture
- Contributing (wiki): https://github.com/dongdongbh/Mindwtr/wiki/Contributing
