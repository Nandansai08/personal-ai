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
Use Brave Search API (not DuckDuckGo).
Env: BRAVE_SEARCH_API_KEY
Endpoint: GET https://api.search.brave.com/res/v1/web/search
Fallback: DuckDuckGo if no BRAVE_SEARCH_API_KEY set.
Brave free tier: 2000 queries/month.

## Plugin System (src/plugins/)
Each plugin exports PersonalAIPlugin interface:
  name: string
  description: string
  tools: RegisteredTool[]
  setup?(): Promise<void>

Plugins live in plugins/ directory, auto-discovered by loader.
Plugin != MCP server. Plugins are internal, typed, tested.
MCP = external servers over stdio.

## Memory (M2 = LIKE search, M10 = embeddings)
M2: SQLite LIKE search — good enough for Phase 1
M10: sqlite-vec for semantic search — added post v1.0
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
M1: events→logger→interface→ollama→factory→context→assistant→cli→index
M2: memory/types→long-term→short-term→wire into assistant
M3: persona/types→loader→profiles→system-prompt→wire into assistant
M4: tools/types→parser→registry→all tools→wire into assistant
M5: openai-compatible→all providers→factory update→model-manager
M6: web/server→web/client
M7: setup wizard→polish
M8: plugins/interface→loader→weather+github+calendar plugins
M9: mcp/loader→mcp/client→wire into index
M10: memory/embeddings→vector-store→upgrade search
M11: voice/stt→tts→wakeword