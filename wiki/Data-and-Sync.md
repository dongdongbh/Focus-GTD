# Data and Sync

Mindwtr stores data locally and supports multiple synchronization options between devices.

---

## Data Storage

### Desktop

Data is stored in a local SQLite database, with a JSON sync/backup file:

| Platform    | Database (SQLite)                                  | JSON (sync/backup)                                     |
| ----------- | -------------------------------------------------- | ------------------------------------------------------ |
| **Linux**   | `~/.local/share/mindwtr/mindwtr.db`                 | `~/.local/share/mindwtr/data.json`                     |
| **Windows** | `%APPDATA%/mindwtr/mindwtr.db`                      | `%APPDATA%/mindwtr/data.json`                          |
| **macOS**   | `~/Library/Application Support/mindwtr/mindwtr.db`  | `~/Library/Application Support/mindwtr/data.json`      |

Config is stored separately:

| Platform    | Location                                      |
| ----------- | --------------------------------------------- |
| **Linux**   | `~/.config/mindwtr/config.toml`               |
| **Windows** | `%APPDATA%/mindwtr/config.toml`               |
| **macOS**   | `~/Library/Application Support/mindwtr/config.toml` |

> Legacy Tauri builds used `~/.config/tech.dongdongbh.mindwtr/` and `~/.local/share/tech.dongdongbh.mindwtr/` on Linux. These are auto-migrated when detected.

### Mobile

Data is stored in a local SQLite database, with a JSON sync/backup file:

- **SQLite DB**: `mindwtr.db`
- **JSON backup**: `data.json`

---

## Sync Backends

Mindwtr supports three sync backends:

### 1. File Sync

Sync via a shared JSON file with any folder-based sync service:

- Dropbox
- Google Drive
- Syncthing
- OneDrive
- iCloud Drive
- Any network folder

#### Syncthing Notes (Recommended Setup)

Syncthing works well with Mindwtr, but the initial setup order matters.

**Recommended flow:**
1. Create a single Syncthing folder (e.g., `Mindwtr/`) and let it fully sync.
2. On desktop, choose that folder in **Settings → Data & Sync → File Sync**.
3. **Export Backup** to that folder to create `data.json` and `attachments/`.
4. Wait for Syncthing to finish syncing to your phone.
5. On mobile, select the same folder in **Settings → Data & Sync**.

**Why you see `attachments (1)` / `attachments (2)`**
Syncthing creates duplicate folders when both devices create or modify the same folder at the same time. This often happens if both devices open Mindwtr before the initial sync completes.

**How to fix duplicates:**
1. Pick the “real” `attachments/` folder (usually the one with more files).
2. Move files from `attachments (1)`/`attachments (2)` into `attachments/`.
3. Delete the duplicate folders and let Syncthing converge.

**Important:** Don’t sync `~/.local/share/mindwtr` directly. Mobile storage is sandboxed. Use the file sync folder + `data.json` instead.

#### OneDrive on Android (Recommended Setup)

Android’s official OneDrive app does **not** keep a local folder in continuous two‑way sync.
To use OneDrive reliably with Mindwtr on Android, install a “bridge” app:

- **OneSync (Autosync for OneDrive)**
- **FolderSync**

Then:
1. Create a OneDrive folder for Mindwtr (on desktop).
2. Use the bridge app to sync that folder to a local folder on Android.
3. In Mindwtr, select that local folder in **Settings → Data & Sync** (Mindwtr will use `data.json` inside).

### 2. WebDAV Sync

Sync directly to a WebDAV server:

- Nextcloud
- ownCloud
- Box.com
- Any WebDAV-compatible server

### 3. Mindwtr Cloud (Self-Hosted)

For advanced users, Mindwtr includes a simple sync server (`apps/cloud`) that can be self-hosted.

- **Protocol**: Simple REST API (GET/PUT)
- **Auth**: Bearer token (mapped to a specific data file on the server)
- **Deployment**: Node.js/Bun

---

## How Sync Works

### Auto-Sync

Mindwtr automatically syncs in the following situations:

- **On data changes** — 5 seconds after any task/project modification (debounced)
- **On app focus** — When the app regains focus (throttled to every 30 seconds)
- **On app blur/background** — When you switch away from the app
- **On startup** — Shortly after the app launches

### Merge Strategy

Mindwtr uses **Last-Write-Wins (LWW)** per item:
- Each task/project has an `updatedAt` timestamp
- When merging, the newer version of each item wins
- Soft-deleted items (tombstones) are preserved for proper sync

### Conflict Visibility & Clock Skew

After each sync, Mindwtr stores sync stats in settings:

- **Conflicts**: total conflict count and a small sample of conflicting IDs
- **Clock skew**: max observed timestamp skew between devices
- **Timestamp fixes**: when `updatedAt < createdAt`, timestamps are corrected during merge

You can see these details in **Settings → Sync** (desktop and mobile). Large skew values usually indicate device clocks are out of sync.

### Attachment Sync & Cleanup

- Attachments are synced **after** metadata merges.
- Missing attachments remain as placeholders until downloaded.
- Orphaned attachments are cleaned up automatically (and can be triggered manually on desktop in **Settings → Sync**).

---

## Desktop Sync Setup

### File Sync

1. Open **Settings → Data & Sync**
2. Set **Sync Backend** to **File**
3. Click **Change Location** and select a folder in your sync service
4. Click **Save**

Mindwtr will automatically sync on startup and when data changes.

### WebDAV Sync

1. Open **Settings → Data & Sync**
2. Set **Sync Backend** to **WebDAV**
3. Enter your WebDAV server details:
   - **URL** — Folder URL; Mindwtr will store `data.json` inside (e.g., `https://nextcloud.example.com/remote.php/dav/files/user/Mindwtr`)
   - **Username** — Your WebDAV username
   - **Password** — Your WebDAV password
4. Click **Save WebDAV**

> **Tip:** For Nextcloud, the URL format is:
> `https://your-server.com/remote.php/dav/files/USERNAME/path/to/folder`
>
> URLs with explicit ports are supported (e.g., `https://example.com:5000/mindwtr`).

## Mobile Sync Setup

Mobile sync requires manually selecting a sync file due to Android/iOS storage restrictions.

### 1. Export Your Data First

1. Go to **Settings → Data & Sync**
2. Tap **Export Backup**
3. Save the file to your sync folder (e.g., Google Drive)

### 2. Select Sync File

1. In **Settings → Data & Sync**
2. Tap **Select Folder**
3. Navigate to your sync folder
4. Select the folder that contains (or will contain) `data.json`

### 3. Auto-Sync

Mobile now syncs automatically:
- When the app goes to background
- 5 seconds after data changes
- When returning to the app (if >30 seconds have passed)

You can also tap **Sync** manually anytime in Settings.

---

## SQLite + JSON Sync Bridge

Mindwtr uses SQLite as the primary local store. When sync is enabled, it keeps a JSON file in sync:

- **Outgoing**: SQLite changes are exported to `data.json` (debounced).
- **Incoming**: External changes to `data.json` are imported back into SQLite.

This preserves Dropbox/Syncthing/WebDAV workflows while improving speed and data safety.

---

## Sync Workflow

### Two Devices

**Initial setup:**
1. Set up desktop with sync folder
2. Export backup, save to sync folder
3. On mobile, select that file

**Daily use:**
1. Make changes on Device A
2. Wait for sync service to replicate
3. On Device B, trigger sync (Settings → Sync)

### Multiple Devices

The same workflow applies. Avoid editing on multiple devices simultaneously to prevent conflicts.

---

## Troubleshooting Checklist

- **Confirm `data.json` exists** in your sync folder and is being updated.
- **Wait for Syncthing to fully sync** before opening Mindwtr on the second device.
- **Use “Sync” manually** in Settings if you want an immediate pull/push.
- **Check for duplicate attachment folders** (`attachments (1)`, etc.) and merge them.
- **Make sure device clocks are correct** (large skew causes conflicts).
- **Verify folder permissions** (Android SAF may block write access to some folders).

---

## Backup and Export

### Export Data

**Desktop:**
- Data is automatically saved to the sync folder

**Mobile:**
1. Go to **Settings → Data & Sync**
2. Tap **Export Backup**
3. Save to your desired location

### Backup Strategy

- Regular exports to sync folder
- Keep local config folder backed up
- The sync file serves as a backup

---

## Troubleshooting

### Sync Not Working

1. **Check sync folder path**
   - Ensure the path exists and is accessible
   - Verify permissions

2. **Check sync service**
   - Is Dropbox/Google Drive running?
   - Is the file synced across devices?

3. **Temporary file errors**
   - If a sync service is mid‑write (e.g., Syncthing), the JSON can be temporarily invalid.
   - Wait a moment and sync again.

4. **Manual sync**
   - Click Sync Now (desktop) or Sync (mobile)
   - Check for any error messages

### Data Conflicts

If you see unexpected data:
1. Export a backup of current data
2. Check the sync folder for the latest file
3. Manually review and merge if needed

### Mobile Sync File Not Found

1. Ensure the file exists in your cloud folder
2. Re-select the file in Settings → Data & Sync
3. Check file permissions

### Reset Sync

To start fresh:
1. Delete the sync folder contents
2. Export from one device
3. Import/sync on other devices

---

## Data Format

The `data.json` file structure:

```json
{
  "tasks": [
    {
      "id": "uuid",
      "title": "Task title",
      "status": "next",
      "contexts": ["@home"],
      "tags": ["#focused"],
      "dueDate": "2025-01-15T09:00:00Z",
      "createdAt": "2025-01-01T10:00:00Z",
      "updatedAt": "2025-01-10T15:30:00Z",
      "deletedAt": null
    }
  ],
  "projects": [
    {
      "id": "uuid",
      "title": "Project name",
      "status": "active",
      "color": "#3B82F6",
      "areaId": "area-uuid",
      "tagIds": ["#client", "#feature"],
      "createdAt": "2025-01-01T10:00:00Z",
      "updatedAt": "2025-01-10T15:30:00Z"
    }
  ],
  "areas": [
    {
      "id": "uuid",
      "name": "Research",
      "color": "#3B82F6",
      "icon": "🔬",
      "order": 0,
      "createdAt": "2025-01-01T10:00:00Z",
      "updatedAt": "2025-01-10T15:30:00Z"
    }
  ],
  "settings": {
    "theme": "dark",
    "language": "en"
  }
}
```

---

## Privacy

- All data is stored locally on your device
- Sync happens through your own cloud service
- No data is sent to Mindwtr servers
- You control your data completely

---

## See Also

- [[User Guide Desktop]]
- [[User Guide Mobile]]
- [[Getting Started]]
- [[Attachments]]
