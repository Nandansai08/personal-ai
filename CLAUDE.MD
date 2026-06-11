# PersonalAI — Claude Code Master Instructions

## Project Purpose
Open source personal AI assistant. Provider-agnostic, local-first.
Repo owner uses Ollama with qwen2.5:14b + gemma3:12b.
Others use any API via .env.

## Hardware (Repo Owner)
RAM: 16GB
Primary: qwen2.5:14b (tools, coding, reasoning)
Secondary: gemma3:12b (chat, writing, long context)
Both auto-switch based on task type.

## Tech Stack
Node.js 20+, TypeScript strict mode
Ollama/Mistral: native fetch (no SDK)
Anthropic: @anthropic-ai/sdk
OpenAI/Groq/LMStudio/Together: openai npm package
Gemini: @google/generative-ai
SQLite: better-sqlite3
Config: js-yaml + zod
CLI: readline + chalk
Web: express + ws
Tests: vitest

## Golden Rule
NEVER import provider SDKs outside src/providers/*.ts
src/core/, src/memory/, src/tools/, src/ui/ are provider-blind.

## Provider Interface
Every provider implements LLMProvider:
  name: string (readonly)
  supportsToolUse: boolean (readonly)
  supportsStreaming: boolean (readonly)
  chat(request: ChatRequest): AsyncGenerator<ChatChunk>
  healthCheck?(): Promise<ProviderHealth>
  listModels?(): Promise<ModelInfo[]>

ChatChunk union:
  { type: 'text', delta: string }
  { type: 'tool_call', id: string, name: string, arguments: unknown }
  { type: 'tool_result', id: string, name: string, result: unknown }
  { type: 'model_switch', from: string, to: string }
  { type: 'done', usage?: TokenUsage }
  { type: 'error', message: string }

## Observability (src/core/logger.ts + events.ts)
Every significant action emits an event:
  user_message, model_selected, tool_called, tool_result,
  memory_saved, memory_retrieved, provider_latency, error

Logger writes to:
  Console (dev mode: LOG_LEVEL=debug)
  ~/.personal-ai/logs/app-YYYY-MM-DD.log (always)

EventBus is internal pub/sub:
  eventBus.emit('tool_called', { name, args, durationMs })
  eventBus.on('tool_called', handler)

Import pattern:
  import { logger } from '@/core/logger'
  import { eventBus } from '@/core/events'

## Ollama Model Rules
NATIVE TOOL USE (pass tools array):
  qwen2.5:* qwen2.5-coder:* llama3.1:* llama3.2:*
  mistral-nemo:* mistral:*

XML FALLBACK (inject into system prompt):
  gemma3:* gemma3n:* phi4:* phi3:* — all others

Gemma 3 XML format (TWO-TAG — works best):
  <tool>tool_name</tool>
  <args>{"key": "value"}</args>

NOT single-tag (Gemma 3 struggles):
  <tool_call>{"name":"...","arguments":{...}}</tool_call>

## Task → Model Routing
tools:       qwen2.5:14b
coding:      qwen2.5-coder:7b
reasoning:   qwen2.5:14b
chat:        gemma3:12b
longcontext: gemma3:12b
quick:       gemma3:12b
default:     qwen2.5:14b

## Agent Profiles (src/persona/profiles.ts)
profiles:
  assistant: general purpose (default)
  coder:     software dev focus, uses qwen2.5-coder
  researcher: deep research, uses gemma3:12b longcontext
  tutor:     teaching mode, step by step

Each profile has: name, system_prompt_addon, preferred_model, tools_priority[]
Switch with: /profile coder or /coder /research /tutor in CLI

## Web Search
Use Serper as the primary search API.
Env: SERPER_API_KEY
Endpoint: POST https://google.serper.dev/search
Fallback: Brave Search if no SERPER_API_KEY is set or Serper fails.
Brave env: BRAVE_SEARCH_API_KEY
Brave endpoint: GET https://api.search.brave.com/res/v1/web/search
Last resort: DuckDuckGo Instant Answers if no search API keys are available.
Serper free tier: 2500 queries/month. Brave free tier: 2000 queries/month.

## Extension System (two-track)
Plugins (src/plugins/) — LOCAL extensions: custom tools, hooks, user/community
  extensions. Plain ESM js + plugin.json manifest in plugins/ or
  ~/.personal-ai/plugins/. Sandboxed (2s hook timeout, error boundaries);
  a failing plugin never crashes the assistant. See docs/PLUGINS.md.
MCP (src/mcp/, M-next) — EXTERNAL integrations: remote tools, third-party
  services over stdio. MCP servers will surface as namespaced RegisteredTools.
First-party tools use RegisteredTool directly (typed, tested, confirm-gated).
Rule: extension talks to an external service → MCP; otherwise → plugin.

## Memory (M2 = LIKE search, M8 = embeddings)
M2: tokenized LIKE search (fallback path)
M8: local embeddings (nomic-embed-text via Ollama) + hybrid retrieval
    (70% similarity / 20% importance / 10% recency); brute-force cosine,
    swap for sqlite-vec only if it ever becomes a bottleneck
Never delete memories. Archive only.

## System Prompt Rules
Qwen2.5 / API models: markdown headers OK, up to 2000 tokens
Gemma 3: numbered lists, plain text, under 1500 tokens
Tool instructions ALWAYS last in prompt.

## File Conventions
MIT license header in every src/ file
JSDoc on all exported functions
No any types
tests/ mirrors src/ structure
Errors returned as values, never thrown

## Build Order
Done M1: events→logger→interface→ollama→factory→context→assistant→cli→index
Done M2: memory/types→long-term→short-term→wire into assistant
Done M3: persona/types→loader→profiles→system-prompt→wire into assistant
Done M4: tools/types→parser→registry→all tools→wire into assistant
Done M5: openai-compatible→all providers→factory update→model-manager
Done M6: web/server→web/client
Done M7: setup wizard→polish
Done M8: memory/embeddings→vector-store→intent→hybrid retrieval
Done M9: plugins/types→sandbox→loader→hooks→registry→manager→wire into bootstrap+cli+web
Done M10: mcp/client (stdio JSON-RPC, no SDK)→mcp/loader→confirm-gated registry tools
Planned M11: local document RAG (reuse embeddings infra)
Planned M12: voice/stt→tts→wakeword
