# FAQ

Frequently asked questions about Mindwtr.

---

## General

### What is Mindwtr?

Mindwtr is a cross-platform Getting Things Done (GTD) productivity app that helps you capture, clarify, organize, and engage with your tasks. Available for desktop (Windows, macOS, Linux) and mobile (Android, iOS).

### Is Mindwtr free?

Yes! Mindwtr is open source and free to use under the MIT license.

### What languages are supported?

Mindwtr currently supports:

- English
- 中文
- Español
- Deutsch
- 日本語
- हिन्दी
- العربية
- Русский
- Français
- Português
- 한국어
- Italiano
- Türkçe

### Where is my data stored?

All data is stored locally on your device:
- **Desktop data (Linux):** `~/.local/share/mindwtr/data.json`
- **Desktop config (Linux):** `~/.config/mindwtr/config.toml`
- **Windows/macOS:** `%APPDATA%/mindwtr/` or `~/Library/Application Support/mindwtr/`
- **Mobile:** Internal app storage

See [[Data and Sync]] for details.

### Is there cloud sync?

Mindwtr supports File Sync, WebDAV, and optional Cloud Sync. See [[Data and Sync]].

### How do I sync with OneDrive (especially on Android)?

Mindwtr already works with OneDrive **via file sync**:

- **Windows/macOS:** Put your Mindwtr `data.json` inside your OneDrive folder. OneDrive handles the sync automatically.
- **Android:** The official OneDrive app does **not** provide true two‑way folder sync.  
  Use a helper “bridge” app such as **OneSync (Autosync for OneDrive)** or **FolderSync** to keep a local folder synced.  
  Then point Mindwtr to that local folder in **Settings → Data & Sync** (Mindwtr uses `data.json` inside).

This is the same approach used by local‑first apps like Obsidian.

### Why doesn’t Mindwtr have a “Sign in with OneDrive / Google Drive” button?

Mindwtr is local‑first and offline‑first. Native cloud integrations require OAuth flows, token storage, and long‑term maintenance.
They also create strong pressure to add *every* provider (Drive, OneDrive, Dropbox, etc.).

File sync keeps your data in your control and avoids a large maintenance and security burden.

### Can Mindwtr integrate with email (Gmail/Outlook) or accept forwarded emails?

Not directly. Building a full email client requires:

- OAuth access to Gmail/Outlook (which now requires costly security audits)
- Robust MIME/HTML parsing and attachment handling
- Ongoing maintenance across providers

**Current alternatives:**
- **Desktop:** Paste `message://` or mail links in a task, or drag an email into a task note in clients that support it.
- **Mobile:** Use the share sheet to send selected email content into Mindwtr.

Mindwtr does **not** offer an `add@mindwtr.com` inbox because that would require a central server to receive and store your email.

---

## Features

### What is GTD?

Getting Things Done (GTD) is a productivity methodology created by David Allen. It consists of five steps: Capture, Clarify, Organize, Reflect, and Engage. See [[GTD Overview]].



### How do recurring tasks work?

When you complete a recurring task, Mindwtr automatically creates the next instance with updated dates. If a due date is set, the next occurrence is calculated from that due date; otherwise it uses the completion time. Set recurrence in the task editor (daily, weekly, monthly, yearly).

### How do I collect logs for a bug report?

Logging is off by default. Enable it only when you want to report a bug.

**Desktop (Tauri):**
1. Go to **Settings → Sync → Diagnostics**.
2. Enable **Debug logging**.
3. Reproduce the issue.
4. Copy the **Log file** path and attach the file to your GitHub issue.

Linux log location (default): `~/.local/share/mindwtr/logs/mindwtr.log`

**Mobile:**
1. Go to **Settings → Data & Sync → Diagnostics**.
2. Enable **Debug logging**.
3. Reproduce the issue.
4. Tap **Share log** and attach it to your GitHub issue.

Logs are local-only and redact common credentials (passwords/tokens) before writing.

### Can I use natural language to add tasks?

Yes! Mindwtr supports quick-add syntax:
- `@context` — Add a context
- `#tag` — Add a tag
- `/due:date` — Set due date (today, tomorrow, friday, next week, etc.)
- `/note:text` — Add description
- `+ProjectName` — Assign to project

Example: `Call client /due:friday @phone`

### What are contexts?

Contexts are tags that indicate where or with what you can complete a task. Examples: `@home`, `@work`, `@phone`, `@computer`. Filter by context to see only tasks you can do right now. See [[Contexts and Tags]].

### How do I capture tasks quickly?

**Desktop:**
- Use the global hotkey to open quick-add from anywhere
- Click the tray icon for instant capture
- Type in any view's input field

**Mobile:**
- Use the share sheet to capture from any app
- Add the home widget for one-tap capture
- Use the Inbox tab input field

---

## Desktop

### What are the keyboard shortcuts?

Mindwtr supports Vim and Emacs keybinding presets. Press `?` (Vim) or `Ctrl-h` (Emacs) to see all shortcuts. See [[Desktop Keyboard Shortcuts]].

### How do I change the theme?

Go to Settings → Appearance. Choose Light, Dark, or System.

### How do I sync with my phone?

1. Configure a sync folder in Settings (point to Dropbox, Syncthing, etc.)
2. On mobile, select the sync file in Settings → Data & Sync
3. Both platforms auto-sync on data changes and when switching apps

See [[Data and Sync]].

### Does it support notifications?

Yes! Mindwtr sends desktop notifications for:
- Due date reminders
- Start time alerts
- Recurring task reminders

You can snooze notifications for later.

### macOS says the app is "damaged"

Run this command in Terminal:
```bash
xattr -cr /Applications/Mindwtr.app
```

This clears the quarantine flag. The app is not notarized with Apple.

---

## Mobile

### Which platforms are supported?

- **Android:** Full support via APK download
- **iOS:** iOS builds require an Apple Developer account ($99/year). Currently available as simulator builds only. If you want iOS builds, please consider [sponsoring the developer](https://github.com/sponsors/dongdongbh) so we can fund the Apple Developer account.

### How do I install on Android?

Download the APK from [GitHub Releases](https://github.com/dongdongbh/Mindwtr/releases) and open it. Enable "Install from unknown sources" if prompted. See [[Mobile Installation]].

### How do I capture from other apps?

Use the **share sheet**! When viewing content in any app (browser, email, notes), tap Share and select Mindwtr. The content will be added to your Inbox.

### Is there a widget?

Yes! Add the Mindwtr widget to your home screen for quick capture and focus items.

### Is the AI assistant required?

No. The AI assistant is optional and off by default. Mindwtr works fully without it.
When enabled, it uses your own API key (BYOK). See [[AI Assistant]].

### How do swipe actions work?

In the Inbox, swipe right on a task to mark it as Done. Other views may have different swipe actions.

### How do I sync with desktop?

1. Export backup to your sync folder (Google Drive, Syncthing, etc.)
2. Select that file in Settings → Data & Sync
3. The app auto-syncs on data changes and when going to background

See [[Data and Sync]].

### Does the mobile app send notifications?

Yes! Mindwtr sends push notifications for:
- Due date reminders
- Start time alerts

You can snooze notifications directly from the notification.

---

## Sync & Data

### Will I lose data if I sync?

No. Mindwtr uses Last-Write-Wins merge, keeping the most recent version of each item. Soft-deleted items sync properly across devices.

### Can I use multiple sync services?

We recommend using one sync folder to avoid conflicts. Pick one service (Dropbox, Google Drive, Syncthing) and use it consistently.

### How do I backup my data?

**Desktop:** Your data is in the data folder. Back up `data.json`.
**Mobile:** Use Export Backup in Settings to save a copy.

### Can I restore deleted tasks?

Soft-deleted tasks are not shown in the UI but remain in the data file briefly. There's no built-in undelete, but you could restore from a backup.

---

## Troubleshooting

### App won't start (Desktop Linux)

Ensure WebKitGTK is installed:
```bash
# Arch
sudo pacman -S webkit2gtk-4.1

# Debian/Ubuntu  
sudo apt install libwebkit2gtk-4.1-0
```

### App crashes on startup (Mobile)

Try clearing app data:
1. Go to Settings → Apps → Mindwtr
2. Tap Storage → Clear Data
3. Reopen the app

Note: This deletes local data.

### Tasks aren't syncing

1. Check that sync folder is accessible
2. Verify sync service is running
3. Check file permissions
4. Try manual sync in Settings

### Notifications not working

**Desktop:**
- Check system notification settings
- Ensure app has notification permission

**Mobile:**
- Grant notification permission in device settings
- Check app notification settings

---

## Contributing

### How can I contribute?

- Report bugs and suggest features on [GitHub Issues](https://github.com/dongdongbh/Mindwtr/issues)
- Submit pull requests
- Help with translations
- Spread the word!

See [[Contributing]].

---

## See Also

- [[Getting Started]]
- [[GTD Overview]]
- [[Data and Sync]]
- [[Contributing]]
