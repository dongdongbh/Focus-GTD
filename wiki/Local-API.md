# Local API Server

Mindwtr includes an optional local REST API server for scripting and integrations. It reads and writes your local `data.json` directly.

---

## Quick Start

From the repo root:

```bash
bun install
bun run mindwtr:api -- --port 4317 --host 127.0.0.1
```

### Options

| Option          | Default          | Description                 |
| --------------- | ---------------- | --------------------------- |
| `--port <n>`    | `4317`           | Server port                 |
| `--host <host>` | `127.0.0.1`      | Bind address                |
| `--data <path>` | Platform default | Override data.json location |

### Environment Variables

| Variable            | Description                                          |
| ------------------- | ---------------------------------------------------- |
| `MINDWTR_DATA`      | Override data.json location (if `--data` is omitted) |
| `MINDWTR_API_TOKEN` | If set, require `Authorization: Bearer <token>`      |

By default, the API resolves `data.json` using Mindwtr's platform paths (preferring XDG data on Linux).

---

## Authentication

If `MINDWTR_API_TOKEN` is set, include:

```
Authorization: Bearer <token>
```

---

## Endpoints

| Method   | Endpoint              | Description                   |
| -------- | --------------------- | ----------------------------- |
| `GET`    | `/health`             | Health check → `{ ok: true }` |
| `GET`    | `/tasks`              | List tasks                    |
| `GET`    | `/tasks?status=next`  | Filter by status              |
| `GET`    | `/tasks?query=@work`  | Search tasks                  |
| `GET`    | `/tasks?all=1`        | Include done/archived         |
| `GET`    | `/tasks?deleted=1`    | Include soft-deleted          |
| `POST`   | `/tasks`              | Create task                   |
| `GET`    | `/tasks/:id`          | Get single task               |
| `PATCH`  | `/tasks/:id`          | Update task                   |
| `DELETE` | `/tasks/:id`          | Soft delete task              |
| `POST`   | `/tasks/:id/complete` | Mark as done                  |
| `POST`   | `/tasks/:id/archive`  | Mark as archived              |
| `GET`    | `/projects`           | List projects                 |
| `GET`    | `/search?query=...`   | Search tasks + projects       |

### Create Task Body

```json
{
  "input": "Call Alice due:tomorrow @phone #errands",
  "title": "Alternative title",
  "props": { "status": "next" }
}
```

If `input` is provided, it runs the quick-add parser (`parseQuickAdd`) to derive fields like `dueDate`, `tags`, `contexts`, `projectId`, etc.

---

## Examples

**List next actions:**

```bash
curl -s 'http://127.0.0.1:4317/tasks?status=next' | jq .
```

**Create via quick-add:**

```bash
curl -s -X POST 'http://127.0.0.1:4317/tasks' \
  -H 'Content-Type: application/json' \
  -d '{"input":"Call Alice due:tomorrow @phone #errands"}' | jq .
```

**Complete a task:**

```bash
curl -s -X POST "http://127.0.0.1:4317/tasks/$TASK_ID/complete" | jq .
```

---

## CLI Tool

A simpler command-line interface is also available:

```bash
# Add a task
bun mindwtr:cli -- add "Call mom @phone #family"

# List active tasks
bun mindwtr:cli -- list

# List with filters
bun mindwtr:cli -- list --status next --query "due:<=7d"

# Complete a task
bun mindwtr:cli -- complete <taskId>

# Search
bun mindwtr:cli -- search "@work"
```

---

## Security Notes

- The server is intended to run on `127.0.0.1` (localhost). Don't expose it publicly unless you understand the risks.
- If you need remote access, set `MINDWTR_API_TOKEN` and place the server behind an authenticated reverse proxy.

---

## See Also

- [[Developer Guide]]
- [[Cloud Sync]]
