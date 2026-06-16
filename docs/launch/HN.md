# Hacker News — Show HN

## Title

```
Show HN: PersonalAI – local-first ChatGPT alternative with 8 providers, semantic memory, MCP, plugins
```

## Body

PersonalAI is a local-first AI assistant — same shape of product as ChatGPT
desktop, but it runs on your machine, with your models, and your memory
never leaves the box (unless you pick a cloud provider).

Tried to write it for the 16 GB-laptop case that the cloud-first assistants
keep ignoring. Default config is two Ollama models with auto-routing:
`qwen2.5:14b` for tool use and reasoning, `gemma3:12b` for chat and long
context. Switch providers (Anthropic, OpenAI, Groq, Gemini, Mistral,
LM Studio, Together) with one env var or `/model claude-sonnet-4-6`.

What's in v1.0:

- **Provider abstraction** — `request.model` is authoritative; no SDK imports
  outside `src/providers/`. Verified by lint + tests.
- **Persistent semantic memory** — local embeddings via `nomic-embed-text`,
  hybrid retrieval (70% similarity / 20% importance / 10% recency), case-
  insensitive dedup, "remember …" intent detection with normalized facts.
- **Plugin system** — drop a folder with `plugin.json` + `index.js` into
  `plugins/`. Sandboxed (2 s timeout, error boundary). Hot-reload.
- **MCP client** — connect any Model Context Protocol server over stdio.
  Tools register as `mcp_<server>_<name>` and always require confirmation.
- **Web UI** — Express + WebSocket, loopback-only with a per-session bearer
  token, Host/Origin checks, tool-confirmation cards.
- **Setup wizard, npm bin** — `npx @nandansai08/personal-ai` and you're in
  the wizard in 90 seconds.

Things I tried hard to do right:

- Memory dedup + normalization is opinionated ("my name is Nandan" stores as
  "User's name is Nandan", not the raw sentence). This sounds minor; it's
  the single biggest quality lever for an assistant that "actually remembers
  things".
- The web server binds 127.0.0.1 only, the WebSocket has Origin + token
  checks, and `file_reader` is allowlist-rooted with a credential denylist.
  Plugin trust model documented honestly: sandbox is an error boundary,
  not a security boundary.
- Provider streaming is one `AsyncGenerator<ChatChunk>` shape for all 8
  providers — same code paths for native tool use and XML-fallback models
  (Gemma 3 emits two-tag XML).

Stack: TypeScript strict, no `any`, Node ≥ 20, SQLite (better-sqlite3, WAL),
Express + ws. 215 tests across providers, agent loop, memory, plugins,
MCP, web server, tools.

Roadmap is v1.1 local document RAG, v1.2 voice. MCP is the primary
integration path; plugins are for local custom extensions.

Repo: https://github.com/Nandansai08/personal-ai
Docs: https://github.com/Nandansai08/personal-ai#readme
Install: `npx @nandansai08/personal-ai`

Happy to answer questions about the architecture, the memory layer, or why
plugins + MCP coexist instead of one replacing the other.

## After-post follow-up template

> Thanks for the read! Some clarifications from comments:
>
> - **Q: how does this differ from OpenWebUI/LibreChat?**
>   Both are great. PersonalAI's specific bets: (1) a strict provider
>   abstraction so the same code runs on Ollama and Anthropic and Groq
>   without per-provider feature gaps, (2) persistent typed memory and
>   automatic "remember …" normalization, (3) hackable single-package
>   install (no Docker required to try). It's the "tinkerer's local
>   assistant" rather than the "team's chat platform".
> - **Q: why TypeScript and not Python?**
>   Streaming, multi-provider, tool-using *application* code. Python is a
>   better fit for ML research; TS is a better fit for this.
> - **Q: privacy story?**
>   Loopback-only web server, bearer token, Host + Origin checks. SQLite
>   is unencrypted at rest by default — disk encryption optional on the
>   roadmap. Plugins run in-process with full privileges (same as VS Code
>   extensions); documented in SECURITY.md.
