# Deployment

## Desktop

- Build with Tauri (Rust + WebView).
- Requires platform toolchains (Xcode on macOS, MSVC on Windows).

## Mobile

- Expo + EAS builds.
- Uses SQLite + JSON fallback for data.

## Self-hosted Sync

- `apps/cloud` provides a lightweight JSON sync endpoint.
- Docker setup lives in `/docker`.

## PWA / Web

- `apps/desktop` can be built as a web bundle and served by Nginx.
- Ensure SPA fallback (`try_files $uri /index.html`) is enabled.

