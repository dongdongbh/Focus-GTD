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
# from repo root (read-only by default)
bun run mindwtr:mcp -- --db "/path/to/mindwtr.db"
```

Enable writes (required for add/update/complete/delete tools):

```bash
bun run mindwtr:mcp -- --db "/path/to/mindwtr.db" --write
```

Stop:
- Press `Ctrl+C` in the terminal.

### Keep-alive behavior (why it sometimes exits)

The MCP server is **stdio‑based**. It stays alive as long as stdin is open.
If your shell/client closes stdin, the process exits.

To force an immediate exit when stdin closes (no keep-alive), pass `--nowait`:

```bash
bun run mindwtr:mcp -- --db "/path/to/mindwtr.db" --nowait
```

Note: When an MCP client launches the server, it keeps stdin open, so the server should remain connected.

### 2) Run without the helper script

```bash
bun run --filter mindwtr-mcp-server dev -- --db "/path/to/mindwtr.db"
```

Stop:
- Press `Ctrl+C` in the terminal.

### 3) Build and run the binary entry (Node)

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

### Optional: create a global `mindwtr-mcp` command

If you want a real `mindwtr-mcp` command on your PATH, create a tiny wrapper:

```bash
cat > ~/bin/mindwtr-mcp <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
cd /absolute/path/to/Mindwtr
exec bun run mindwtr:mcp -- "$@"
EOF
chmod +x ~/bin/mindwtr-mcp
```

Then use:

```bash
mindwtr-mcp --db "/path/to/mindwtr.db"
```

### Desktop app toggle?

Not yet. Start/stop is still manual.

---

## MCP Client Configuration

MCP clients run the server as a subprocess. You point them to **the command** and pass args/env.

**Important:** Do NOT use `bun run mindwtr:mcp` for MCP clients. The `bun run` wrapper outputs shell messages to stdout (e.g., `$ bun run --filter...`) which breaks the JSON-RPC protocol. Always run bun directly on the source file.

### Example (generic MCP config)

```json
{
  "mcpServers": {
    "mindwtr": {
      "command": "bun",
      "args": [
        "/absolute/path/to/Mindwtr/apps/mcp-server/src/index.ts",
        "--db",
        "/home/dd/.local/share/mindwtr/mindwtr.db"
      ]
    }
  }
}
```

Add `--write` to the args if you want to enable **add/update/complete/delete** tools.

If your client doesn't support Bun, build first and use Node:

```bash
# Build once
cd /path/to/Mindwtr && bun run --filter mindwtr-mcp-server build
```

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

Add `--write` to the args if you want to enable **add/update/complete/delete** tools.

### Claude Desktop

Claude Desktop supports MCP (stdio). Add a server entry in its MCP configuration.

Typical config file locations:
- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

After editing, fully quit and relaunch Claude Desktop.

### Claude Code (CLI)

Add a server via the CLI:

```bash
claude mcp add mindwtr -- \
  bun /path/to/Mindwtr/apps/mcp-server/src/index.ts --db "/path/to/mindwtr.db" --write
```

Or edit `~/.claude.json` directly:

```json
{
  "projects": {
    "/path/to/your/project": {
      "mcpServers": {
        "mindwtr": {
          "type": "stdio",
          "command": "bun",
          "args": [
            "/absolute/path/to/Mindwtr/apps/mcp-server/src/index.ts",
            "--db",
            "/home/dd/.local/share/mindwtr/mindwtr.db",
            "--write"
          ]
        }
      }
    }
  }
}
```

Then restart the Claude Code session and run `/mcp` to verify it's connected.

### OpenAI Codex (config.toml)

Codex stores MCP config in `~/.codex/config.toml`. Add:

```toml
[mcp_servers.mindwtr]
command = "bun"
args = ["/absolute/path/to/Mindwtr/apps/mcp-server/src/index.ts", "--db", "/path/to/mindwtr.db", "--write"]

# Optional: pass env vars to the server
[mcp_servers.mindwtr.env]
MINDWTR_DB_PATH = "/path/to/mindwtr.db"
```

Restart Codex after saving.

### Gemini CLI

Gemini CLI uses a JSON `settings.json` with `mcpServers`, either:
- User scope: `~/.gemini/settings.json`
- Project scope: `.gemini/settings.json` in your repo

You can add Mindwtr MCP two ways:

**1) CLI (recommended):**

```bash
gemini mcp add mindwtr \
  bun /absolute/path/to/Mindwtr/apps/mcp-server/src/index.ts \
  --db "/path/to/mindwtr.db" --write
```

**2) Edit settings.json manually:**

```json
{
  "mcpServers": {
    "mindwtr": {
      "command": "bun",
      "args": ["/absolute/path/to/Mindwtr/apps/mcp-server/src/index.ts", "--db", "/path/to/mindwtr.db", "--write"]
    }
  }
}
```

Restart the Gemini CLI session after saving.

### Other MCP clients

Any MCP-compatible client can work as long as it can launch a **stdio** server with the command + args above.

---

## Tools

- `mindwtr.list_tasks`
  - Input: `{ status?: "inbox"|"next"|"waiting"|"someday"|"done"|"archived"|"all", projectId?, limit?, offset?, search?, includeDeleted? }`
- `mindwtr.list_projects`
  - Input: `{}`
- `mindwtr.get_task`
  - Input: `{ id, includeDeleted? }`
- `mindwtr.add_task` **(requires `--write`)**
  - Input: `{ title? | quickAdd?, status?, projectId?, dueDate?, startTime?, contexts?, tags?, description?, priority?, timeEstimate? }`
- `mindwtr.update_task` **(requires `--write`)**
  - Input: `{ id, title?, status?, projectId?, dueDate?, startTime?, contexts?, tags?, description?, priority?, timeEstimate?, reviewAt?, isFocusedToday? }`
- `mindwtr.complete_task` **(requires `--write`)**
  - Input: `{ id }`
- `mindwtr.delete_task` **(requires `--write`)**
  - Input: `{ id }`
- `mindwtr.restore_task` **(requires `--write`)**
  - Input: `{ id }`

All tools return JSON text payloads with the resulting task(s).

---

## Testing

### Quick smoke test (CLI)

1) Start the server (read‑only):
```bash
bun run mindwtr:mcp -- --db "/home/dd/.local/share/mindwtr/mindwtr.db"
```

2) Connect via your MCP client and run:
- `mindwtr.list_tasks` (limit 5)

If you want to test writes, restart with `--write`:
```bash
bun run mindwtr:mcp -- --db "/home/dd/.local/share/mindwtr/mindwtr.db" --write
```

Then test:
- `mindwtr.add_task` (quickAdd: "Test task @home /due:tomorrow")
- `mindwtr.complete_task` (use returned task id)
- `mindwtr.update_task` (e.g. set status or dueDate)

If the list returns tasks and add/complete works, the server is healthy.

### Claude Code sanity check

1) Add the server:
```bash
claude mcp add mindwtr -- \
  bun /path/to/Mindwtr/apps/mcp-server/src/index.ts --db "/path/to/mindwtr.db" --write
```
2) Restart Claude Code, run `/mcp`, and verify **mindwtr** is connected.
3) Ask the model to call:
   - `mindwtr.list_tasks` (limit 5)
   - `mindwtr.add_task` (quickAdd: "Test MCP @home /due:tomorrow")
   - `mindwtr.complete_task` (use returned id)

---

## Safety & Concurrency

- The server uses **SQLite WAL mode** and a 5s busy timeout.
- Writes will fail if the DB is locked; clients should retry.
- Writes are **disabled by default**. Use `--write` to enable edits.
- When running under **Bun**, write operations go through the shared **@mindwtr/core** store to enforce business rules.
- When running under **Node**, write operations fall back to direct SQL.

---

## Notes

- This MCP server writes directly to the SQLite database used by the desktop app.
- Keep an eye on schema changes across app versions (update queries if needed).
