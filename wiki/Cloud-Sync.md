# Cloud Sync (Self-Hosted)

> **Note:** This page describes a **small sync server** only. It is **not** the Mindwtr app UI. Running this server (even in Docker) does not give you a hosted web app — it only provides a sync endpoint that desktop/mobile clients can point to.

Mindwtr includes a minimal self-hosted Cloud Sync backend under `apps/cloud`. It stores one JSON file per token and is designed to be deployed behind your own HTTPS reverse proxy.

---

## Server Setup

You can run the server using **Docker** (recommended) or locally with Bun.

### Using Docker
See [[Docker Deployment]] for full instructions on running the Cloud Server with Docker Compose.

### Run Locally

From the repo root:

```bash
bun install
bun run --filter mindwtr-cloud dev -- --host 0.0.0.0 --port 8787
```

Or directly:

```bash
cd apps/cloud
bun run dev -- --host 0.0.0.0 --port 8787
```

### Configuration

| Variable                       | Default            | Description             |
| ------------------------------ | ------------------ | ----------------------- |
| `HOST`                         | `0.0.0.0`          | Bind address            |
| `PORT`                         | `8787`             | Server port             |
| `MINDWTR_CLOUD_DATA_DIR`       | `apps/cloud/data/` | Data directory          |
| `MINDWTR_CLOUD_RATE_WINDOW_MS` | `60000`            | Rate limit window       |
| `MINDWTR_CLOUD_RATE_MAX`       | `120`              | Max requests per window |

---

## Endpoints

| Method | Endpoint   | Description                                  |
| ------ | ---------- | -------------------------------------------- |
| `GET`  | `/health`  | Health check → `{ ok: true }`                |
| `GET`  | `/v1/data` | Returns your `AppData` JSON (requires auth)  |
| `PUT`  | `/v1/data` | Replaces your `AppData` JSON (requires auth) |

### Authentication

Use a bearer token:

```
Authorization: Bearer <token>
```

The server hashes the token (SHA-256) and uses it as the filename, so each token maps to one data file.

---

## Client Setup

In **Settings → Sync**:

1. Set **Sync Backend** to **Cloud**
2. Set **Cloud URL** to `https://your-domain.example/v1` (Mindwtr will append `/data`)
3. Set **Access Token** to any long random string you control

---

## Security Notes

- The cloud server does **not** enforce HTTPS; deploy behind an HTTPS reverse proxy
- CORS is `*` by design for self-hosted usage; protect the endpoint with a secret token and network controls
- Treat the bearer token like a password (anyone with it can read/write your data)

---

## See Also

- [[Data and Sync]]
- [[Developer Guide]]
