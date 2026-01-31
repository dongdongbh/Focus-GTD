# Getting Started

Welcome to Mindwtr! This guide will help you get up and running quickly.

## Installation

### Desktop

| Platform          | Installation                                                                                        |
| ----------------- | --------------------------------------------------------------------------------------------------- |
| **Arch Linux**    | `yay -S mindwtr-bin` or `paru -S mindwtr-bin`                                                       |
| **Debian/Ubuntu** | Add the APT repo (recommended) or download `.deb` from [Releases](https://github.com/dongdongbh/Mindwtr/releases) |
| **Fedora/RHEL**   | Add the DNF repo (recommended) or download `.rpm` from [Releases](https://github.com/dongdongbh/Mindwtr/releases) |
| **AppImage**      | Download `.AppImage`, `chmod +x`, and run                                                           |
| **Windows**       | Microsoft Store or `winget install dongdongbh.Mindwtr` (or `.msi`/`.exe` from [Releases](https://github.com/dongdongbh/Mindwtr/releases)) |
| **macOS**         | `brew install --cask mindwtr` (or `.dmg` from [Releases](https://github.com/dongdongbh/Mindwtr/releases)) |

> **Note:** On macOS, if you see "damaged" or "unidentified developer" warning:
> ```bash
> xattr -cr /Applications/Mindwtr.app
> ```

See [[Desktop Installation]] for detailed instructions.

### Mobile

| Platform    | Installation                                                                 |
| ----------- | ---------------------------------------------------------------------------- |
| **Android** | Google Play or APK from [Releases](https://github.com/dongdongbh/Mindwtr/releases) |
| **iOS**     | Simulator builds only (requires Apple Developer account)                     |

See [[Mobile Installation]] for detailed instructions.

---

## First Launch

When you first open Mindwtr, you'll see the **Inbox** view. This is your capture zone.

### The Basic Workflow

1. **Capture** everything to the Inbox
2. **Clarify** each item using the processing wizard
3. **Organize** into Next Actions, Projects, or Someday/Maybe
4. **Reflect** during your Weekly Review
5. **Engage** with confidence

---

## Quick Add Syntax

Mindwtr supports natural language quick-add. Type directly in the task input:

| Syntax             | Example                    | Result                |
| ------------------ | -------------------------- | --------------------- |
| `@context`         | `Buy milk @errands`        | Adds @errands context |
| `#tag`             | `Research topic #creative` | Adds #creative tag    |
| `+Project`         | `Call vendor +HomeReno`    | Assigns to project    |
| `+Multi Word`      | `+New Project Name`        | Assigns to "New Project Name" |
| `/due:date`        | `Report /due:friday`       | Sets due date         |
| `/note:text`       | `Task /note:remember X`    | Adds description      |
| `/status`          | `/next`, `/waiting`, `/done` | Sets status (also `/someday`, `/inbox`) |

**Date examples:**
- `/due:today`, `/due:tomorrow`
- `/due:friday`, `/due:next week`
- `/due:in 3 days`, `/due:2025-01-15`

**Escaping**
- Use a backslash to keep symbols as plain text: `\\@`, `\\#`, `\\+`, `\\/`
- Example: `Call \\@support /due:tomorrow` → title becomes `Call @support`

**Unicode support**
- Context and tag names accept Unicode letters and numbers (e.g., CJK and accented characters).

> **Tip:** You can also use **Audio Capture** to speak your tasks. Enable it in **Settings → AI Assistant** to use voice-to-text with smart parsing.

---

## Next Steps

- Learn about [[GTD Overview]]
- Explore the [[User Guide Desktop]] or [[User Guide Mobile]]
- Set up [[Data and Sync]]
- Enable [[AI Assistant]] (optional)

---

## Need Help?

- Check the [[FAQ]]
- [Report an issue](https://github.com/dongdongbh/Mindwtr/issues)
- Read the full [[GTD Best Practices]] guide
