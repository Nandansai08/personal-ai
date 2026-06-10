# PersonalAI

> Local-first personal AI assistant. Any model, any provider.

Run Ollama locally, swap to Claude or GPT with one env var. No cloud required.

---

## What's in v0.4.0

- **Agentic tool loop** — model calls tools, sees results, continues (up to 6 iterations)
- **Web search** — Serper (primary) → Brave → DuckDuckGo fallback
- **Notes** — save/get/list/delete notes in SQLite
- **Tasks** — create/update/list tasks with priority and status
- **Calculator** — safe math expression evaluator
- **File reader** — read local text files (max 100KB)
- **Memory tool** — model can save/search memories directly
- **Live spinner** — animated indicator while model thinks
- **Input lock** — keystrokes blocked during streaming (no mix-in glitch)
- **Personalized persona** — casual tone, friend-style replies

Previous milestones:
- **v0.3** — persona profiles (`/coder`, `/researcher`, `/tutor`), hot-reload config
- **v0.2** — SQLite memory, facts persist across sessions
- **v0.1** — Ollama streaming, native + XML tool call formats, CLI, logging

---

## Roadmap

| Version | What ships |
|---------|-----------|
| ~~**v0.1**~~ | Core — Ollama streaming, CLI, logging |
| ~~**v0.2**~~ | SQLite memory — facts saved across sessions |
| ~~**v0.3**~~ | Persona profiles — `/coder`, `/researcher`, `/tutor` |
| ~~**v0.4**~~ | Tool system — web search, notes, tasks, calculator, file reader |
| **v0.5** | All API providers — Anthropic, OpenAI, Groq, Gemini, Mistral |
| **v0.6** | Web UI — browser chat interface |
| **v0.7** | Setup wizard — guided first-run |
| **v0.8** | Plugins — weather, GitHub, calendar |
| **v0.9** | MCP server support |
| **v1.0** | Semantic memory (embeddings) + voice |

---

## Prerequisites

- [Node.js 20+](https://nodejs.org/)
- [Ollama](https://ollama.ai/) running locally **or** an API key for another provider

Recommended local models (16GB RAM):
```
ollama pull qwen2.5:14b    # primary — tools, coding, reasoning
ollama pull gemma3:12b     # secondary — chat, long context
```

---

## Quick Start

```bash
# 1. Clone
git clone https://github.com/Nandansai08/PersonalAi.git
cd PersonalAi

# 2. Install
npm install

# 3. Configure
cp .env.example .env
# Edit .env — set SERPER_API_KEY for web search (free at serper.dev)

# 4. Pull a model
ollama pull qwen2.5:14b

# 5. Start
npm start
```

---

## Web Search Setup

Web search works out of the box with a free Serper key (no credit card):

1. Sign up at [serper.dev](https://serper.dev) — 2500 free searches/month
2. Copy your API key
3. Add to `.env`: `SERPER_API_KEY=your_key_here`

Falls back to Brave Search (if `BRAVE_SEARCH_API_KEY` set), then DuckDuckGo.

---

## CLI Commands

| Command | Description |
|---------|-------------|
| `/exit` | Quit |
| `/clear` | Clear conversation history |
| `/models` | List available models |
| `/health` | Check provider connectivity |
| `/logs` | Show log file path |
| `/tools` | List registered tools |
| `/memory` | Memory stats |
| `/memory list` | Recent memories |
| `/memory search <q>` | Search memories |
| `/memory save <type> <content>` | Save a memory |
| `/profile` | Show active profile |
| `/profile list` | All profiles |
| `/profile <name>` | Switch profile |
| `/coder` | Switch to coder profile |
| `/research` | Switch to researcher profile |
| `/tutor` | Switch to tutor profile |
| `/help` | Show all commands |

---

## Configuration

Key `.env` settings:

```env
OLLAMA_MODEL=qwen2.5:14b      # model to use
OLLAMA_NUM_CTX=4096            # context window (reduce for speed)
OLLAMA_NUM_PREDICT=1024        # max output tokens
SERPER_API_KEY=                # web search (free at serper.dev)
```

Persona and profiles are in `config/persona.yaml` and `config/profiles.yaml` — hot-reloaded on save.

---

## License

MIT — see [LICENSE](LICENSE).
