# Web App (PWA)

Mindwtr's desktop app can run as a browser app using the Vite build. When running in a browser (non-Tauri), it uses `localStorage` for persistence and registers a service worker for offline/PWA support.

---

## Run Locally

You can run the PWA locally using Bun, or use **Docker**.

### Using Docker (Recommended)
See [[Docker Deployment]] for instructions on running the PWA container.

### Using Bun
From the repo root:

```bash
bun install
bun desktop:web
```

This starts Vite on `http://localhost:5173/`.

---

## Build for Hosting

```bash
bun desktop:web:build
```

Build output is in `apps/desktop/dist/` and can be hosted as a static site.

---

## PWA Behavior

- The app registers `apps/desktop/public/sw.js` when running in a browser
- `sw.js` precaches `/`, `/index.html`, `/manifest.webmanifest`, `/icon.png`, `/logo.png` and caches other same-origin GET requests on demand
- Navigation requests fall back to `/index.html` when offline (so deep links still load)

---

## Hosting Requirements

Host `apps/desktop/dist/` at the site root (`/`). The service worker is registered from `/sw.js` and the manifest references root paths.

Ensure your static host serves:
- `manifest.webmanifest` as `application/manifest+json` (recommended)
- `sw.js` as `application/javascript`

If you need to host under a subpath (e.g. `/mindwtr/`), the service worker registration and manifest paths must be adjusted to match the base path.

---

## Limitations

- Browser builds store data in `localStorage` (clearing site data clears Mindwtr data)
- Some desktop-only features may be unavailable in the browser, such as file attachments that require native file access
- No native system tray or global hotkey support

---

## See Also

- [[Developer Guide]]
- [[Data and Sync]]
