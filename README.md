# PersonalAI

> Local-first personal AI assistant. Any model, any provider.

Run Ollama locally, swap to Claude or GPT with one env var. No cloud required.

---

## Works in v0.1.0

- Ollama chat with streaming (qwen2.5:14b default)
- Native tool-call format for qwen2.5, llama3, mistral
- XML tool-call fallback for gemma3, phi
- Structured logging to `~/.personal-ai/logs/`
- Internal event bus (observability hooks)
- Conversation context (in-memory)
- CLI with readline REPL

**Not yet in v0.1.0** (see roadmap): memory persistence, persona profiles, web UI, plugins, MCP, voice.

---

## Roadmap

| Version | What ships |
|---------|-----------|
| **v0.2** | SQLite memory (M2) — facts saved across sessions |
| **v0.3** | Persona profiles (M3) — `/coder`, `/researcher`, `/tutor` |
| **v0.4** | Tool system (M4) — web search, file ops, code execution |
| **v0.5** | All API providers (M5) — Anthropic, OpenAI, Groq, Gemini, Mistral |
| **v0.6** | Web UI (M6) — browser chat interface |
| **v0.7** | Setup wizard (M7) — guided first-run |
| **v0.8** | Plugins (M8) — weather, GitHub, calendar |
| **v0.9** | MCP server support (M9) |
| **v1.0** | Semantic memory (M10) + voice (M11) |

---

## Prerequisites

- [Node.js 20+](https://nodejs.org/)
- [Ollama](https://ollama.ai/) running locally (default) **or** an API key for another provider

---

## Quick Start

```bash
# 1. Clone
git clone https://github.com/yourusername/personal-ai.git
cd personal-ai

# 2. Install
npm install

# 3. Configure
cp .env.example .env
# Edit .env — uncomment and fill only what you use

# 4. Pull a model (Ollama users)
ollama pull qwen2.5:14b

# 5. Start
npm start

# 6. Chat
[qwen2.5:14b] > Hello!

# 7. Exit
[qwen2.5:14b] > /exit
```

**Using a cloud provider instead?** Set `ANTHROPIC_API_KEY` (or equivalent) in `.env`. Provider switching is not yet wired to the factory in v0.1.0 — it always creates an OllamaProvider. Full provider support ships in v0.5.

---

## CLI Commands

| Command   | Description |
|-----------|-------------|
| `/exit`   | Quit |
| `/clear`  | Clear conversation history |
| `/models` | List available models |
| `/health` | Check provider connectivity |
| `/logs`   | Show log file path |
| `/help`   | Show all commands |

---

## License

MIT — see [LICENSE](LICENSE).
