# MCP Server

Mindwtr provides an optional **MCP (Model Context Protocol)** server. This allows you to connect AI agents (like **Claude Desktop**, **Claude Code**, **OpenAI Codex**, or **Gemini CLI**) directly to your local Mindwtr database.

This is a **local stdio** server (no HTTP). MCP clients launch it as a subprocess and talk over JSON‑RPC on stdin/stdout.

---

## Requirements

- **Node.js 18+** (for the MCP client that spawns the server)
- **Bun** (recommended for running/building the server)
- A local Mindwtr database (`mindwtr.db`)

### Default Database Locations
- **Linux:** `~/.local/share/mindwtr/mindwtr.db`
- **macOS:** `~/Library/Application Support/mindwtr/mindwtr.db`
- **Windows:** `%APPDATA%\mindwtr\mindwtr.db`

You can override the database location with:
- `--db /path/to/mindwtr.db`
- Environment variable: `MINDWTR_DB_PATH` or `MINDWTR_DB`

---

## Setup & Configuration

MCP clients run the server as a subprocess. You point them to **the command** and pass arguments.

### Key Arguments
- `--db "/path/to/mindwtr.db"`: Path to your SQLite database.
- `--write`: Enable write operations (add, update, complete, delete). **Without this flag, the server is read-only.**

### 1. Claude Desktop
Add a server entry to your Claude Desktop configuration file.
- **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "mindwtr": {
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
```
*Note: Replace `/absolute/path/to/Mindwtr` and the DB path with your actual paths.*

### 2. Claude Code (CLI)
You can add the server via the CLI:

```bash
claude mcp add mindwtr -- \
  bun /path/to/Mindwtr/apps/mcp-server/src/index.ts --db "/path/to/mindwtr.db" --write
```

### 3. Gemini CLI
Gemini CLI uses `settings.json` (User: `~/.gemini/settings.json` or Project: `.gemini/settings.json`).

**Command Line:**
```bash
gemini mcp add mindwtr \
  bun /absolute/path/to/Mindwtr/apps/mcp-server/src/index.ts \
  --db "/path/to/mindwtr.db" --write
```

**Manual Config:**
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

---

## Running Manually

You usually don't need to run this manually (the MCP client does it), but it's useful for testing.

### From Source (Bun)
```bash
# Read-only
bun run mindwtr:mcp -- --db "/path/to/mindwtr.db"

# With write access
bun run mindwtr:mcp -- --db "/path/to/mindwtr.db" --write
```

### Build & Run (Node)
```bash
# Build
bun run --filter mindwtr-mcp-server build

# Run
node apps/mcp-server/dist/index.js --db "/path/to/mindwtr.db"
```

---

## Available Tools

When connected, the AI agent has access to these tools:

### Read Tools
- **`mindwtr.list_tasks`**: List tasks with filters (status, project, date range, search).
- **`mindwtr.list_projects`**: List all projects.
- **`mindwtr.get_task`**: Get details of a specific task by ID.

### Write Tools (Requires `--write`)
- **`mindwtr.add_task`**: Create a new task. Supports natural language `quickAdd` (e.g., "Buy milk @errands /due:tomorrow").
- **`mindwtr.update_task`**: Update an existing task.
- **`mindwtr.complete_task`**: Mark a task as done.
- **`mindwtr.delete_task`**: Soft-delete a task.
- **`mindwtr.restore_task`**: Restore a soft-deleted task.

---

## Safety & Notes

- **Concurrency:** The server uses SQLite WAL mode. Writes may fail if the DB is locked; clients are expected to retry.
- **Shared Logic:** Write operations use the shared `@mindwtr/core` library to ensure business rules are enforced.
- **Keep-Alive:** The server stays alive as long as `stdin` is open.

## Troubleshooting

- **"Command not found"**: `mindwtr-mcp` is not a global command. Use `bun run mindwtr:mcp` or the full path to the built script.
- **Client Connection Issues**: Ensure you are NOT using `bun run` as the command in your MCP client config, as it may output extra text. Run `bun` directly on the source file or `node` on the built file.
