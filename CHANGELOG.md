# Changelog

All notable changes to PersonalAI.

## [1.0.0]

### Added
- **MCP client (v1.0)**: connect Model Context Protocol servers over stdio via
  `config/mcp.json` — minimal JSON-RPC client (no SDK), tools register as
  `mcp_<server>_<tool>` and **always require confirmation**; failed servers
  are reported and skipped; `/mcp` lists servers + tools
- **Web tool-confirmation UI**: dangerous tools (file_reader, all MCP tools)
  show an inline Allow/Deny card in the browser; no response within 60 s or a
  disconnect = denied
- **Web UI V2**: memory vault wired to the real engines — Keyword/Semantic
  search toggle (`?mode=semantic`), live embedder badge (shows nomic-embed-text
  + indexed count), per-memory archive button; Settings gains an MCP Servers
  panel; tool registry rows show MCP and CONFIRM badges
- `GET /api/mcp` (read-only server status), `/api/memories?mode=semantic`,
  `/api/stats` now includes `memoryIndex` and per-tool confirmation/source
- `docs/MCP.md`, `config/mcp.json.example`

### Changed
- Tool results stored with `role: 'tool'` (was user-role text); providers
  that can't express orphan tool messages (OpenAI-style, Anthropic) downgrade
  them safely to user text with the `[TOOL OUTPUT]` framing intact
- `cli.ts` split: slash-command handlers moved to `src/ui/commands.ts`
- Per-session tool confirmation: web connections confirm over their own
  socket instead of a global handler

## [0.9.0]

### Added
- **Plugin system (M9)**: local extensions via `plugins/<name>/plugin.json` +
  plain ESM `index.js` — custom tools auto-register into `/tools`; hooks
  (`beforePrompt`, `afterResponse`, `beforeToolCall`, `afterToolCall`,
  `memoryStored`, `sessionStarted/Ended`) run sandboxed with 2 s timeouts and
  error boundaries so a failing plugin never crashes the assistant
- `/plugins` CLI commands: list, health, reload, enable/disable (persisted)
- Read-only `GET /api/plugins` for the web UI
- Example plugins: `hello-world` (tool + hook), `timestamp`
- `docs/PLUGINS.md` — architecture, lifecycle, hooks, best practices
- Plugins complement MCP: plugins = local extensions, MCP (next milestone) =
  external integrations

## [Unreleased]

### Security
- Web server binds to `127.0.0.1` only; LAN exposure removed
- Per-session bearer token required on all `/api` routes and WebSocket upgrades
- Host-header validation (DNS-rebinding defense) and WebSocket Origin checks
- `file_reader` restricted to allowed roots (`FILE_READER_ROOTS`); credential
  files (`.env`, SSH keys, `.pem`/`.key`, shell history) and sensitive
  directories (`.ssh`, `.aws`, …) always denied, including via symlinks
- Per-call confirmation prompt (CLI) for dangerous tools (`file_reader`)
- API key input masked in setup wizard; keys sent in headers, never URLs
- Memories and tool results framed as data, not instructions (prompt-injection
  mitigation)

### Fixed
- Memory search now tokenizes queries — conversational messages actually
  retrieve memories (whole-sentence LIKE almost never matched)
- XML tool calls leaked as text (Gemini/Gemma) are now parsed and executed
  instead of silently discarded
- `request.model` is authoritative in providers — fixes model race between
  concurrent CLI/web sessions
- `.env` writer no longer corrupts values containing `$`
- `OLLAMA_NUM_CTX` default raised 2048 → 8192 (2048 silently truncated the
  system prompt in longer conversations)
- Task routing: keyword intent ("fix the bug") wins over message length
- Memory `save()` returns properly deserialized rows; case-insensitive dedup

### Changed
- `ts-node` → `tsx` (works on modern Node)
- vitest 1.x → 3.2.6 (clears all npm audit findings; 4.x reverted — its rolldown
  dependency breaks `npm ci` lock integrity)
- `uuid` dependency replaced by `node:crypto.randomUUID`
- Plugin system removed before it shipped — MCP (v0.9) is the only extension
  system; first-party tools keep the internal typed registry
- Dead stub directories (`src/plugins/`, `src/voice/`) removed from the package
- Provider metadata centralized in `src/providers/metadata.ts`
- `AssistantEngine` constructor takes an options object
- Tool results truncated at 8 KB; conversation trimmed to ~24 K char budget

### Added
- **Semantic memory**: local embeddings (nomic-embed-text via Ollama), hybrid
  retrieval (70% similarity / 20% importance / 10% recency), near-duplicate
  merging, low-value summarization, `/memory semantic` + `/memory rebuild-index`
  + `/memory stats`; existing databases migrate transparently and fall back to
  keyword search when embeddings are unavailable
- **Explicit memory intent**: "remember …" / "don't forget …" / "save this …"
  now saves a normalized third-person fact with category (education / career /
  project / personal / preference) and tags, and replies with a confirmation
  instead of chatting past it
- Grouped `/memory` overview by category
- Stream renderer with line-state tracking — fixes words splitting across the
  token-usage line (XML-stripper tail flushed before status output)
- ESLint (flat config) + CI matrix (Ubuntu/Windows × Node 20/22)
- `SECURITY.md`, `docs/ARCHITECTURE.md`, PR template
- 56 new tests (security, agent loop, memory quality, CLI helpers) — 168 total

## [0.7.0]
- Setup wizard, `/cost`, friendly errors, session save

## [0.6.0]
- Web UI — multi-view, avatars, GPU util, hardware panel, graphs

## [0.5.0]
- 8 providers, ModelManager auto-routing, 4 agent profiles
