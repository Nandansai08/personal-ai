# Roadmap

PersonalAI shipped v1.0 with the full local-first assistant stack: 8 providers,
ModelManager auto-routing, persistent semantic memory, plugin system, MCP
client, and a hardened web UI. The roadmap below outlines what's next.

## Now (v1.0.x)

Stabilization and polish on the v1.0 launch.

- Demo GIF in README (record CLI + web flow)
- Web UI polish: keyboard shortcuts panel, command palette additions
- Plugin marketplace pointer in `/plugins` view
- Per-provider tool-message threading (`role:'tool'`) where the provider can
  express it without breaking compatibility
- Additional examples in `plugins/` (calendar, weather, GitHub)

## Short-term (next 1–2 months)

| Feature | Why |
|---|---|
| Docker image + devcontainer | Zero-install for evaluators |
| Local document RAG | Reuse the embeddings infra to chat with personal files |
| Web UI mobile pass | The shell is responsive; the chat needs touch-tuned interactions |
| Auto-summarized memory rollups | Compact low-importance memories into themed summaries |
| Provider streaming for Anthropic tool blocks | Cleaner tool-call animations on Claude |

## Mid-term (3–6 months)

| Feature | Why |
|---|---|
| Voice (STT + TTS) | The "Jarvis" half of the brief — pluggable engines (whisper.cpp, Piper) |
| Vision input (images → models that support it) | Already supported by most providers; needs UI surface |
| Knowledge-graph memory layer | Relationships between facts ("Nandan → IIT Dhanbad → CSE"); enables timeline + topic clustering |
| Multi-agent workflows | Profiles already exist; add an orchestration mode for delegating sub-tasks |
| OAuth-based MCP servers | Calendar, Gmail, GitHub via official MCP servers |

## Long-term (6–12 months)

- Local document RAG with citation rendering in the web UI
- Goal tracking + automation (scheduled tasks that survive restart)
- Cross-device sync (encrypted snapshot to user-controlled storage — never a vendor)
- Wake-word + always-on listening mode (opt-in, fully local)
- Mobile companion app (PWA over the existing API surface)

## Non-goals

- A managed cloud service. PersonalAI runs on your machine.
- Vendor lock-in. The provider abstraction stays clean; switching costs stay
  one env var.
- Built-in payments / subscriptions / accounts.

## Version history

| Version | Highlights |
|---|---|
| v1.0 | MCP client, web tool-confirmation UI, role:'tool' threading, cli split, Web UI V2 |
| v0.9 | Plugin system — sandboxed local tools + hooks |
| v0.8 | Security hardening, semantic memory via local embeddings, npm packaging |
| v0.7 | Setup wizard, `/cost`, friendly errors, session save |
| v0.6 | Web UI — Express + WebSocket streaming |
| v0.5 | 8 providers, ModelManager auto-routing, 4 agent profiles |
| v0.4 | Tool system (parser, registry, built-in tools) |
| v0.3 | Persona + profiles |
| v0.2 | Memory (SQLite WAL) |
| v0.1 | Core assistant + Ollama |

See [CHANGELOG.md](../CHANGELOG.md) for the detailed log.
