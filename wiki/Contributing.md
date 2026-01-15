# Contributing

Thank you for your interest in contributing to Mindwtr! This guide will help you get started.

---

## Code of Conduct

Be kind, respectful, and constructive. We're all here to build something useful together.

---

## Ways to Contribute

### Report Bugs

Found a bug? [Open an issue](https://github.com/dongdongbh/Mindwtr/issues) with:
- Steps to reproduce
- Expected behavior
- Actual behavior
- Platform (Desktop/Mobile, OS version)
- App version

### Suggest Features

Have an idea? [Open a feature request](https://github.com/dongdongbh/Mindwtr/issues) with:
- Clear description of the feature
- Use case / problem it solves
- Optional: mockups or examples

### Submit Code

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

---

## Development Setup

See [[Developer Guide]] for full setup instructions.

### Quick Start

```bash
git clone https://github.com/dongdongbh/Mindwtr.git
cd Mindwtr
bun install
bun desktop:dev    # or bun mobile:start
```

---

## Pull Request Process

### 1. Create a Branch

```bash
git checkout -b feature/your-feature-name
# or
git checkout -b fix/bug-description
```

### 2. Make Changes

- Follow the existing code style
- Add tests for new functionality
- Update documentation if needed

### 3. Test Your Changes

```bash
# Run all tests
bun test

# Test desktop
bun desktop:dev

# Test mobile
bun mobile:start
```

### 4. Commit

Write clear, descriptive commit messages:

```
feat: add recurring task support for yearly recurrence

- Added yearly option to recurrence selector
- Updated createNextRecurringTask to handle yearly
- Added tests for yearly recurrence
```

Commit prefixes:
- `feat:` — New feature
- `fix:` — Bug fix
- `docs:` — Documentation
- `style:` — Formatting
- `refactor:` — Code refactoring
- `test:` — Adding tests
- `chore:` — Maintenance

### 5. Push and Create PR

```bash
git push origin feature/your-feature-name
```

Then open a pull request on GitHub.

### 6. Review

- Address any feedback
- Keep the PR focused on one thing
- Be patient — maintainers are volunteers

---

## Code Style

### TypeScript

- Use TypeScript for all code
- Enable strict mode
- Avoid `any` types
- Use interfaces for object shapes

### React

- Functional components only
- Use hooks (useState, useEffect, etc.)
- Named exports preferred
- Keep components focused

### Formatting

- Use consistent indentation (2 or 4 spaces)
- Run Prettier if configured
- Follow existing patterns in the codebase

### Comments

- JSDoc for public functions
- Explain "why" not "what"
- Keep comments up to date

---

## Testing

### Running Tests

```bash
# All tests
bun test

# Watch mode
bun test --watch

# Specific file
bun test store.test.ts
```

### Writing Tests

- Use descriptive test names
- Test behavior, not implementation
- Include edge cases
- Keep tests focused

```typescript
describe('addTask', () => {
    it('should add task to inbox by default', async () => {
        await addTask('New task');
        expect(tasks).toContainEqual(
            expect.objectContaining({ title: 'New task', status: 'inbox' })
        );
    });
});
```

---

## Project Structure

```
Mindwtr/
├── apps/
│   ├── cloud/          # Sync server
│   ├── desktop/        # Tauri desktop app
│   └── mobile/         # Expo mobile app
├── packages/
│   └── core/           # Shared business logic
├── docs/               # Documentation
├── wiki/               # Wiki source files
└── .github/            # CI/CD workflows
```

### Where to Make Changes

| Change Type    | Location                    |
| -------------- | --------------------------- |
| Business logic | `packages/core/src/`        |
| Desktop UI     | `apps/desktop/src/`         |
| Mobile UI      | `apps/mobile/app/`          |
| Translations   | `packages/core/src/i18n-translations.ts` |
| Documentation  | `docs/` or `wiki/`          |

---

## Translation

### Adding Translations

Edit `packages/core/src/i18n-translations.ts`:

```typescript
export const translations = {
    en: {
        'new.key': 'English text',
    },
    zh: {
        'new.key': '中文文本',
    },
};
```

### Adding a New Language

1. Add language code to the `Language` type (in `i18n-types.ts`)
2. Add translations object for the language
3. Update language selector in Settings
4. Test thoroughly

---

## Release Process

Releases are automated via GitHub Actions:

1. Version is bumped in `package.json`
2. `CHANGELOG.md` is updated
3. Git tag is created
4. CI builds and uploads release assets

---

## Questions?

- [Open an issue](https://github.com/dongdongbh/Mindwtr/issues)
- Check existing issues and discussions
- Read the [[Developer Guide]] and [[Architecture]]

---

## Recognition

Contributors are recognized in:
- Git history
- Release notes
- README acknowledgments

Thank you for helping make Mindwtr better! 🙏

---

## See Also

- [[Developer Guide]]
- [[Architecture]]
- [[Core API]]