# MCP (Model Context Protocol)

PersonalAI connects to MCP servers over stdio and exposes their tools to the
assistant. MCP is the extension track for **external integrations** —
filesystem servers, web fetchers, GitHub, databases, anything from the MCP
ecosystem. (Local custom extensions belong in [plugins](PLUGINS.md).)

## Setup

Create `config/mcp.json` (or `~/.personal-ai/mcp.json`):

```json
{
  "servers": {
    "fetch": {
      "command": "uvx",
      "args": ["mcp-server-fetch"]
    }
  }
}
```

Each entry: `command` (+ optional `args`, `env`). On startup PersonalAI
spawns each server, performs the MCP initialize handshake, and registers
every tool as `mcp_<server>_<tool>` in the shared tool registry.

```
✓ MCP: fetch connected (1 tools)
```

## Behavior

- **Every MCP tool requires confirmation** before each call (CLI y/N prompt,
  web approve/deny card) — external tools are never auto-executed.
- A failing server is reported and skipped; the assistant keeps running.
- `/mcp` lists servers, connection status, and registered MCP tools.
- Requests time out (10 s handshake, 30 s tool calls); a dead server fails
  its pending calls with clear errors instead of hanging the chat.

## Security

MCP servers are separate processes you choose to run — the same trust rule
as plugins applies: only configure servers you trust. Tool results are
treated as untrusted data (framed as `[TOOL OUTPUT]`, never as instructions).

## Protocol notes

Implementation is a minimal JSON-RPC 2.0 client over newline-delimited
stdio (`src/mcp/client.ts`) — protocol version `2024-11-05`, tool surface
only (initialize, tools/list, tools/call). No SDK dependency.
