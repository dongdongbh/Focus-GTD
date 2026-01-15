# Diagnostics and Logs

Mindwtr includes built-in diagnostics logging to help troubleshoot sync and crash issues. Logs are **local only**, and sensitive values are **redacted** before writing.

---

## Enable debug logging

### Desktop
1. Open **Settings → Sync**
2. Toggle **Debug logging**
3. Reproduce the issue

### Mobile
1. Open **Settings → Diagnostics**
2. Toggle **Debug logging**
3. Reproduce the issue

---

## Share or clear logs

### Desktop
- The log file path is shown in **Settings → Sync → Diagnostics**
- You can clear logs from the same screen

### Mobile
- Use **Share log** to export a log file
- Use **Clear log** to remove old entries

---

## Default log locations (desktop)

| Platform | Log file |
| --- | --- |
| Linux | `~/.local/share/mindwtr/logs/mindwtr.log` |
| Windows | `%APPDATA%/mindwtr/logs/mindwtr.log` |
| macOS | `~/Library/Application Support/mindwtr/logs/mindwtr.log` |

---

## What gets logged

- Sync errors and steps
- Conflict summaries (when diagnostics are enabled)
- Unexpected runtime errors

Sensitive values (API keys, tokens, passwords, URLs with credentials) are redacted automatically.

---

## Related

- [[FAQ]]
- [[Data and Sync]]
