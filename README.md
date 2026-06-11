# PersonalAI

[![CI](https://github.com/Nandansai08/personal-ai/actions/workflows/ci.yml/badge.svg)](https://github.com/Nandansai08/personal-ai/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node 20+](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](package.json)

**Local-first AI assistant. Any provider. Runs on your machine.**

<!-- demo.gif: record with `npm start` → ask a question → /model switch → web UI. Keep under 15s. -->
![Demo](docs/demo.gif)

No cloud lock-in. Switch between Ollama, Anthropic, OpenAI, Groq, Gemini, Mistral, LM Studio, or Together with one env var. Auto-routes tasks to the right model — qwen2.5:14b for tools/reasoning, gemma3:12b for chat/long context.

---

## Providers

| Provider | Free Tier | Local | Tool Use | Speed |
|---|---|---|---|---|
| **Ollama** | Unlimited | Yes | Native | Fast (GPU-dependent) |
| **Anthropic** | Paid only | No | Native | Fast |
| **OpenAI** | Paid only | No | Native | Fast |
| **Groq** | 14k req/day | No | Native | Very fast |
| **Gemini** | 1500 req/day | No | Native | Fast |
| **Mistral** | Paid only | No | Native | Fast |
| **LM Studio** | Unlimited | Yes | No | Fast (GPU-dependent) |
| **Together.ai** | $1 credit | No | No | Fast |

See [docs/PROVIDERS.md](docs/PROVIDERS.md) for API key links, recommended models, and free tier details.

---

## Features

- **8 providers** — Ollama, Anthropic, OpenAI, Groq, Gemini, Mistral, LM Studio, Together; swap with `PROVIDER=groq`
- **Auto model routing** — ModelManager detects task type per message and hot-switches models (qwen2.5:14b for tools, gemma3:12b for chat)
- **4 agent profiles** — `assistant`, `coder`, `researcher`, `tutor`; each overrides system prompt, model, and tool priority
- **Persistent memory** — SQLite-backed long-term memory; facts, preferences, context, and episodic entries survive restarts
- **6 built-in tools** — web search (Serper → Brave → DuckDuckGo), notes, tasks, calculator, file reader, memory save
- **Plugin system** — drop a folder with `plugin.json` + `index.js` into `plugins/` to add tools and hooks; sandboxed, hot-reloadable, no build step ([docs](docs/PLUGINS.md))
- **Streaming output** — token-by-token display with animated spinner and tool call progress indicators
- **Hot-reload config** — edit `persona.yaml` or `profiles.yaml` while running; changes apply to the next message
- **Observability** — every action emits typed events; daily log files at `~/.personal-ai/logs/`
- **Provider-blind core** — `src/core/`, `src/memory/`, `src/tools/`, `src/ui/` never import provider SDKs
- **No cloud required** — works entirely offline with Ollama and local models

---

## Quick Start

**Fastest** (once published to npm):

```bash
npx @nandansai08/personal-ai
```

Or install globally:

```bash
npm i -g @nandansai08/personal-ai
personal-ai
```

The first-run wizard walks you through provider + persona setup; config is
stored in `~/.personal-ai/`.

**From source:**

**1. Clone and install**

```bash
git clone https://github.com/Nandansai08/personal-ai.git
cd personal-ai
npm install
```

**2. Set up Ollama** (skip if using an API provider)

```bash
# Install from https://ollama.ai
ollama pull qwen2.5:14b
ollama pull gemma3:12b
```

**3. Configure `.env`**

```bash
cp .env.example .env
# Edit .env — set PROVIDER and any required API keys
```

**4. (Optional) Add a search key for web search**

```
# Primary: Serper.dev — free 2500 queries/month, no card required
# https://serper.dev → get key → SERPER_API_KEY=your_key
# Optional fallback: Brave Search → BRAVE_SEARCH_API_KEY=your_key
```

**5. Customize your persona** (optional)

Edit `config/persona.yaml` — set your name, tone, and expertise areas.

**6. Build**

```bash
npm run build
```

**7. Start**

```bash
npm start
```

**8. Try it**

```
[qwen2.5:14b] > who won today's cricket match?
[qwen2.5:14b] > /profile coder
[qwen2.5-coder:7b|coder] > write a debounce function in TypeScript
[qwen2.5-coder:7b|coder] > /model gemma3:12b
[gemma3:12b|coder] > explain async generators
```

---

## Environment Variables

Copy `.env.example` to `.env`. Only configure what you use.

### Core

| Variable | Default | Description |
|---|---|---|
| `PROVIDER` | `ollama` | Active provider: `ollama` \| `anthropic` \| `openai` \| `groq` \| `gemini` \| `mistral` \| `lmstudio` \| `together` |
| `LOG_LEVEL` | `info` | `debug` \| `info` \| `warn` \| `error` |

### Ollama

| Variable | Default | Description |
|---|---|---|
| `OLLAMA_BASE_URL` | `http://localhost:11434` | Ollama server URL |
| `OLLAMA_MODEL` | `qwen2.5:14b` | Default model (tools, reasoning) |
| `OLLAMA_CODER_MODEL` | `qwen2.5:14b` | Model for coding tasks (falls back to default) |
| `OLLAMA_CHAT_MODEL` | `gemma3:12b` | Model for chat, quick, long-context |
| `OLLAMA_NUM_CTX` | `2048` | Context window size |
| `OLLAMA_NUM_PREDICT` | `1024` | Max tokens per response |
| `OLLAMA_TEMPERATURE` | `0.7` | Sampling temperature |

### API Providers

| Variable | Description |
|---|---|
| `ANTHROPIC_API_KEY` | [console.anthropic.com](https://console.anthropic.com) |
| `ANTHROPIC_MODEL` | Default: `claude-sonnet-4-6` |
| `OPENAI_API_KEY` | [platform.openai.com/api-keys](https://platform.openai.com/api-keys) |
| `OPENAI_MODEL` | Default: `gpt-4o-mini` |
| `GROQ_API_KEY` | [console.groq.com/keys](https://console.groq.com/keys) |
| `GROQ_MODEL` | Default: `llama-3.3-70b-versatile` |
| `GEMINI_API_KEY` | [aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey) |
| `GEMINI_MODEL` | Default: `gemini-2.0-flash` |
| `MISTRAL_API_KEY` | [console.mistral.ai/api-keys](https://console.mistral.ai/api-keys/) |
| `MISTRAL_MODEL` | Default: `mistral-large-latest` |
| `LMSTUDIO_BASE_URL` | Default: `http://localhost:1234/v1` |
| `LMSTUDIO_MODEL` | Default: `local-model` |
| `TOGETHER_API_KEY` | [api.together.xyz/settings/api-keys](https://api.together.xyz/settings/api-keys) |
| `TOGETHER_MODEL` | Default: `meta-llama/Llama-3.3-70B-Instruct-Turbo` |

### Search

| Variable | Description |
|---|---|
| `SERPER_API_KEY` | Primary — [serper.dev](https://serper.dev), free 2500/month |
| `BRAVE_SEARCH_API_KEY` | Fallback — [api.search.brave.com](https://api.search.brave.com), free 2000/month |

Search order is Serper first, then Brave Search, then DuckDuckGo Instant Answers as a last resort.

---

## Persona (`config/persona.yaml`)

Controls the assistant's name, tone, and response style.

```yaml
name: "Aria"           # Assistant name
user_name: "Nanda"     # Your name — used in memory and greetings

tone: "casual, direct, like a knowledgeable friend"

expertise:             # Topic areas
  - software development
  - cricket and sports

avoid:                 # Phrases to never say
  - "Certainly!"
  - "Great question!"

custom_instructions: | # Appended verbatim to system prompt
  Talk to Nanda like a friend, not a formal assistant.
```

Changes hot-reload — no restart required.

---

## Profiles (`config/profiles.yaml`)

Profiles override the system prompt, model, tool priority, and temperature.

| Profile | Command | Model | Best For |
|---|---|---|---|
| `assistant` | `/profile assistant` | auto-routed | General tasks, daily use |
| `coder` | `/coder` | qwen2.5:14b | Writing code, debugging, TypeScript |
| `researcher` | `/research` | gemma3:12b | Deep research, multi-angle analysis |
| `tutor` | `/tutor` | gemma3:12b | Step-by-step teaching, guided explanation |

Switch profile mid-session — takes effect on the next message.

---

## Slash Commands

| Command | Description |
|---|---|
| `/help` | Show all commands |
| `/exit` | Quit |
| `/clear` | Clear conversation history |
| **Model** | |
| `/models` | List models available from the current provider |
| `/model` | Show current model routing (mode + task mappings) |
| `/model <name>` | Pin to a specific model (e.g. `/model gemma3:4b`) |
| `/model auto` | Resume automatic task-based model routing |
| `/switch` | Show provider-switch instructions |
| `/switch <provider>` | Show required `.env` settings for a provider switch |
| **Profiles** | |
| `/profile` | Show active profile |
| `/profile list` | List all profiles |
| `/profile <name>` | Switch to a profile by name |
| `/coder` | Switch to coder profile |
| `/research` | Switch to researcher profile |
| `/tutor` | Switch to tutor profile |
| **Memory** | |
| `/memory` | Show memory stats |
| `/memory list` | List 10 most recent memories |
| `/memory search <q>` | Search memories by keyword |
| `/memory save <type> <content>` | Save a memory (`fact` \| `preference` \| `context` \| `episodic`) |
| **Tools** | |
| `/tools` | List registered tools |
| **Debug** | |
| `/health` | Check provider connectivity and latency |
| `/logs` | Show path to today's log file |

---

## Plugins

Add a tool in 30 seconds — drop a folder into `plugins/` (or `~/.personal-ai/plugins/`), no build step:

```
plugins/my-plugin/
├── plugin.json    {"name":"my-plugin","version":"1.0.0","description":"…","main":"./index.js","enabled":true}
└── index.js
```

```js
export default {
  name: 'my-plugin', version: '1.0.0', description: 'My first tool',
  tools: [{
    definition: { name: 'my_tool', description: 'Says hi', parameters: { type: 'object', properties: {} } },
    async execute() { return { success: true, data: 'hi!' } },
  }],
}
```

Restart (or `/plugins reload`) — the tool appears in `/tools` and the model can call it.
Plugins also support hooks (`beforePrompt`, `afterResponse`, tool/memory/session events),
run sandboxed with timeouts, and never crash the assistant. Full guide: [docs/PLUGINS.md](docs/PLUGINS.md).

> Plugins are **trusted code** running with full process privileges — install only plugins you've read or trust. External integrations belong in MCP (v1.0 roadmap), not plugins. See [SECURITY.md](SECURITY.md).

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         src/index.ts                            │
│     loads config · wires provider + engine + CLI + tools        │
└────────────────────────────┬────────────────────────────────────┘
                             │
          ┌──────────────────┼──────────────────────┐
          ▼                  ▼                       ▼
┌─────────────────┐  ┌──────────────────┐  ┌───────────────────┐
│  src/ui/cli.ts  │  │  src/core/       │  │  src/providers/   │
│                 │  │                  │  │                   │
│  readline CLI   │  │  assistant.ts    │  │  interface.ts     │
│  /commands      │  │  context.ts      │  │  factory.ts       │
│  spinner        │  │  model-manager   │  │  ollama.ts        │
│  tool display   │  │  events.ts       │  │  anthropic.ts     │
└────────┬────────┘  │  logger.ts       │  │  openai-compat.ts │
         │           └──────┬───────────┘  │  openai.ts        │
         │                  │              │  groq.ts          │
         │                  ▼              │  gemini.ts        │
         │        ┌─────────────────┐      │  mistral.ts       │
         │        │  src/memory/    │      │  lmstudio.ts      │
         │        │                 │      │  together.ts      │
         │        │  long-term.ts   │      └───────────────────┘
         │        │  short-term.ts  │
         │        │  types.ts       │      ┌───────────────────┐
         │        └─────────────────┘      │  src/persona/     │
         │                                 │                   │
         │        ┌─────────────────┐      │  profiles.ts      │
         └───────▶│  src/tools/     │      │  system-prompt.ts │
                  │                 │      │  loader.ts        │
                  │  registry.ts    │      └───────────────────┘
                  │  parser.ts      │
                  │  web-search.ts  │
                  │  notes.ts       │
                  │  tasks.ts       │
                  │  calculator.ts  │
                  │  file-reader.ts │
                  │  memory-tool.ts │
                  └─────────────────┘
```

**Golden rule:** `src/core/`, `src/memory/`, `src/tools/`, `src/ui/` never import provider SDKs. All SDK imports live in `src/providers/*.ts`.

---

## Adding a Custom Provider

**1. Create `src/providers/myprovider.ts`:**

```typescript
// MIT License — personal-ai
import type { LLMProvider, ChatRequest, ChatChunk, ProviderHealth } from './interface.js'
import { eventBus } from '../core/events.js'

// fallow-ignore-next-line unused-export
export class MyProvider implements LLMProvider {
  readonly name             = 'myprovider'
  readonly supportsToolUse  = false
  readonly supportsStreaming = true
  readonly model: string

  constructor() {
    this.model = process.env['MY_MODEL'] ?? 'my-model-name'
  }

  async *chat(request: ChatRequest): AsyncGenerator<ChatChunk> {
    const startMs = Date.now()
    // call your API, yield chunks
    yield { type: 'text', delta: 'hello' }
    yield { type: 'done', usage: { input: 10, output: 5 } }
    eventBus.emit('provider_latency', {
      provider: 'myprovider', model: this.model, latencyMs: Date.now() - startMs,
    })
  }

  async healthCheck(): Promise<ProviderHealth> {
    return { ok: true, latencyMs: 0, model: this.model }
  }
}
```

**2. Register in `src/providers/factory.ts`:**

```typescript
// Add to ProviderName union:
type ProviderName = '...' | 'myprovider'

// Add to PROVIDER_INFO:
myprovider: { envKey: 'MY_API_KEY', signupUrl: 'https://myprovider.com/keys' },

// Add to loadProvider():
case 'myprovider': return new (await import('./myprovider.js')).MyProvider()
```

**3.** Set `PROVIDER=myprovider` in `.env`.

See [CONTRIBUTING.md](CONTRIBUTING.md) for the full provider checklist.

---

## Web UI

Multi-view browser interface served by the same Node.js process. Split theme: dark nav sidebar, light main content, dark live-events panel.

```bash
# Standalone (recommended):
npm run web
# → http://localhost:3000
```

**Views:**

| View | Description |
|---|---|
| **Chat** | Streaming chat with message avatars, tool call badges, model-switch pills |
| **Code Workspace** | Editor with line numbers, file tabs, AI assistant panel |
| **Research** | Web search integration, memory panel, Knowledge Graph SVG |
| **Memory / Vault** | Vault Index — browse, search, export memories; Vector Topology graph |
| **Settings** | Provider cards with status badges, Hardware Context, task routing table |

**Live Events panel (right sidebar):**
- Real-time event stream: `model_selected`, `tool_called`, `tool_result`, `done`, `error`
- `STREAMING` badge while response is in-flight
- GPU UTIL card — live VRAM usage from Ollama `/api/ps`
- Tokens/sec and context-window fill bars

**Hardware Context (Settings → Hardware):**
- RAM usage bar from Node.js `os` module — no external tools needed
- CPU load average, thermal status (NOMINAL / WARM / HIGH), swap latency estimate
- Auto-refreshes every 30 s

**Task routing table** shows active model per task type with fallback provider column. Populated live from `/api/stats`.

**Performance optimizations:**
- `keep_alive: -1` keeps Ollama models in VRAM between requests
- Both models warm-up on server start — first message latency ~2–5 s instead of 30–50 s
- `OLLAMA_NUM_CTX=8192` default — lower to 4096/2048 on RAM-tight machines

Set `PORT=8080` in `.env` to change the port. `autoPort: true` in `.claude/launch.json` for dev.

---

## Roadmap

| Version | Status | Goal |
|---|---|---|
| v0.5 | Done | 8 providers, ModelManager auto-routing, 4 agent profiles |
| v0.6 | Done | Web UI — Express + WebSocket streaming chat in browser |
| v0.7 | Done | Setup wizard, `/cost` tracking, model-pin for all providers, friendly errors, session save |
| v0.8 | Done | Security hardening, semantic memory (local embeddings via Ollama), session save/load, npm packaging |
| v0.9 | Done | Plugin system — local tools + hooks, sandboxed, hot-reload ([docs/PLUGINS.md](docs/PLUGINS.md)) |
| v1.0 | Planned | MCP support — connect any MCP server over stdio |
| v1.1 | Planned | Local document RAG — point the existing embeddings at your files |
| v1.2 | Planned | Voice — STT + TTS + wake word |

---

## Security

PersonalAI is local-first by design: the web UI binds to `127.0.0.1` only,
WebSocket connections are origin-checked, and the file-reader tool is
restricted to allowed roots with credential files always denied.
See [SECURITY.md](SECURITY.md) for the full security model and reporting policy.

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) and [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).
Changes are tracked in [CHANGELOG.md](CHANGELOG.md).

---

## License

MIT — see [LICENSE](LICENSE).
