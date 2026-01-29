# Mindwtr Docker (PWA + Cloud)

This folder contains Dockerfiles and a compose file to run:
- **mindwtr-app**: the desktop web/PWA build, served by Nginx
- **mindwtr-cloud**: the lightweight sync server

## Quick start (compose)

```bash
docker compose -f docker/compose.yaml up --build
```

Then open:
- PWA: `http://localhost:5173`
- Cloud health: `http://localhost:8787/health`

## Configure sync token

The cloud server expects a token. In `docker/compose.yaml`, set:

```
MINDWTR_CLOUD_TOKEN=your_token_here
```

Use the **same token** in Mindwtr Settings → Sync → Self-Hosted.
Set the Self-Hosted URL to the **base** endpoint, for example:

```
http://localhost:8787/v1
```

Mindwtr will automatically append `/data` and store `data.json` (and attachments) under that endpoint.

Example to generate a token:

```
cat /dev/urandom | LC_ALL=C tr -dc 'a-zA-Z0-9' | fold -w 50 | head -n 1
```

Or you can use https://it-tools.tech/token-generator

## API (task automation)

The cloud container now exposes the REST API on the same host/port as sync, using the **same Bearer token**.

Base URL:

```
http://localhost:8787/v1
```

Create a task:

```
curl -X POST \
  -H "Authorization: Bearer your_token_here" \
  -H "Content-Type: application/json" \
  -d '{"input":"Review invoice from Paperless /due:tomorrow #finance"}' \
  http://localhost:8787/v1/tasks
```

List tasks:

```
curl -H "Authorization: Bearer your_token_here" \
  "http://localhost:8787/v1/tasks?status=next"
```

## Volumes

Persist cloud data by mounting a host path:

```
/path/data_dir:/app/cloud_data
```

## Build without compose (optional)

```bash
# PWA
docker build -f docker/app/Dockerfile -t mindwtr-app .

# Cloud
docker build -f docker/cloud/Dockerfile -t mindwtr-cloud .
```

## Notes

- The PWA uses client-side rendering; Nginx is configured with `try_files` to avoid 404s on refresh.
- Bun is pinned to `1.3` and the build uses C++20 flags for `better-sqlite3`.
