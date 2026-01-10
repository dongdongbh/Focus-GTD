# Mindwtr MCP Server

Local MCP server for Mindwtr. Connect MCP clients (Claude Desktop, etc.) to your local Mindwtr SQLite database.

This is a **local stdio** server (no HTTP). MCP clients launch it as a subprocess and talk over JSON‑RPC on stdin/stdout.

---

## Requirements

- Node.js 18+ (for the MCP client that spawns the server)
- Bun (recommended for development in this repo)
- A local Mindwtr database (`mindwtr.db`)

Default database locations:
- Linux: `~/.local/share/mindwtr/mindwtr.db`
- macOS: `~/Library/Application Support/mindwtr/mindwtr.db`
- Windows: `%APPDATA%\mindwtr\mindwtr.db`

You can override with:
- `--db /path/to/mindwtr.db`
- `MINDWTR_DB_PATH=/path/to/mindwtr.db`
- `MINDWTR_DB=/path/to/mindwtr.db`

---

## Start / Stop

### 1) Run directly from the repo (recommended)

```bash
# from repo root
bun run mindwtr:mcp -- --db "/path/to/mindwtr.db"
```

Stop:
- Press `Ctrl+C` in the terminal.

### Why it exits immediately in a terminal

The MCP server is **stdio‑based**. If no MCP client is connected, stdin closes and the process exits.
To keep it running while you test manually, use `--wait`:

```bash
bun run mindwtr:mcp -- --db "/path/to/mindwtr.db" --wait
```

You can also set:

```
MINDWTR_MCP_WAIT=1
```

### 2) Run without the helper script

```bash
bun run --filter mindwtr-mcp-server dev -- --db "/path/to/mindwtr.db"
```

Stop:
- Press `Ctrl+C` in the terminal.

### 3) Build and run the binary entry

```bash
# from repo root
bun run --filter mindwtr-mcp-server build
node apps/mcp-server/dist/index.js --db "/path/to/mindwtr.db"
```

Stop:
- Press `Ctrl+C` in the terminal.

---

## Why `mindwtr-mcp` is “command not found”

`mindwtr-mcp` is the **package binary**. It only exists after you build the package and run it via Node, or when you use the Bun workspace script.

Use one of these instead:

```bash
# ✅ works immediately
bun run mindwtr:mcp -- --db "/path/to/mindwtr.db"

# ✅ build then run
bun run --filter mindwtr-mcp-server build
node apps/mcp-server/dist/index.js --db "/path/to/mindwtr.db"
```

(We can add a desktop toggle to start/stop it in-app later; it’s not wired yet.)

---

## MCP Client Configuration

MCP clients run the server as a subprocess. You point them to **the command** and pass args/env.

Below are **generic** examples. Each client has its own config location and format, but the concept is the same.

### Example (generic MCP config)

```json
{
  "mcpServers": {
    "mindwtr": {
      "command": "bun",
      "args": [
        "run",
        "mindwtr:mcp",
        "--",
        "--db",
        "/home/dd/.local/share/mindwtr/mindwtr.db"
      ],
      "env": {
        "MINDWTR_DB_PATH": "/home/dd/.local/share/mindwtr/mindwtr.db"
      }
    }
  }
}
```

If your client doesn’t support Bun, use Node:

```json
{
  "mcpServers": {
    "mindwtr": {
      "command": "node",
      "args": [
        "/absolute/path/to/Mindwtr/apps/mcp-server/dist/index.js",
        "--db",
        "/home/dd/.local/share/mindwtr/mindwtr.db"
      ]
    }
  }
}
```

### Claude Desktop

Claude Desktop supports MCP (stdio). Add a server entry in its MCP configuration using one of the examples above.

### Gemini / Other MCP clients

Any MCP-compatible client can work as long as it can launch a **stdio** server with the command + args above.

---

## Tools

- `mindwtr.list_tasks`
  - Input: `{ status?: "inbox"|"next"|"waiting"|"someday"|"done"|"archived"|"all", projectId?, limit?, offset?, search?, includeDeleted? }`
- `mindwtr.add_task`
  - Input: `{ title? | quickAdd?, status?, projectId?, dueDate?, startTime?, contexts?, tags?, description? }`
- `mindwtr.complete_task`
  - Input: `{ id }`

All tools return JSON text payloads with the resulting task(s).

---

## Testing

### Quick smoke test (CLI)

1) Start the server:
```bash
bun run mindwtr:mcp -- --db "/home/dd/.local/share/mindwtr/mindwtr.db"
```

2) Connect via your MCP client and run:
- `mindwtr.list_tasks` (limit 5)
- `mindwtr.add_task` (quickAdd: "Test task @home /due:tomorrow")
- `mindwtr.complete_task` (use returned task id)

If the list returns tasks and add/complete works, the server is healthy.

---

## Safety & Concurrency

- The server uses **SQLite WAL mode** and a 5s busy timeout.
- Writes will fail if the DB is locked; clients should retry.
- Start with `--readonly` to block all writes.

---

## Notes

- This MCP server writes directly to the SQLite database used by the desktop app.
- Keep an eye on schema changes across app versions (update queries if needed).
