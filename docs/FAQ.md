# FAQ

## Why does this exist?

ChatGPT-class assistants are excellent — and entirely cloud-based. PersonalAI
is the same shape of product, but running on your machine: you choose the
model, the data never leaves the box (when you use a local provider), and
when you do use a cloud API the key is one of yours — not the product's.

## Is this another wrapper around ChatGPT?

No. The provider abstraction is real: PersonalAI runs identically on Ollama,
Anthropic, OpenAI, Groq, Gemini, Mistral, LM Studio, and Together. Switch
providers with one env var. The default configuration is Ollama-only — no
cloud accounts required.

## What hardware do I need for local use?

For the default setup (`qwen2.5:14b` + `gemma3:12b`), 16 GB RAM is the
sweet spot. The auto-router uses the smaller `gemma3:12b` for chat and only
loads `qwen2.5:14b` when tool use is needed. On 8 GB systems, pin to a
single smaller model like `qwen2.5:7b` or `llama3.2:3b`.

## Where is my data stored?

- Memories: `~/.personal-ai/memory.db` (SQLite, WAL journal)
- Sessions: `~/.personal-ai/sessions/`
- Logs: `~/.personal-ai/logs/`
- Config: `.env` in the install directory or `~/.personal-ai/.env` for npx
  installs

Nothing is sent off-device unless you configured a cloud provider.

## How does the assistant decide which model to use?

`ModelManager` classifies each message by intent (tool use, coding,
reasoning, long-context, chat, quick). On Ollama with both qwen and gemma
pulled, it routes per-message. Pin with `/model <name>` to override; resume
auto-routing with `/model auto`.

## How does memory actually work?

Three layers:

1. **Conversation context** — the last N messages, trimmed to a token budget.
2. **Long-term memory** — SQLite WAL store. Auto-extracted from "remember …"
   triggers, normalized to third-person facts, deduplicated case-insensitively.
3. **Semantic retrieval** — when `nomic-embed-text` is available via Ollama,
   the assistant uses local embeddings + hybrid ranking (70% similarity,
   20% importance, 10% recency). Falls back to tokenized keyword search.

## Why is the web UI loopback-only?

The web server holds the keys to tools (file reader, MCP servers), memory,
and your conversation history. Binding to `127.0.0.1` plus a per-session
bearer token is the right default for a single-user assistant. If you need
remote access, put an authenticating reverse proxy in front and understand
what you're exposing.

## How do I add a custom tool?

Two paths, depending on what the tool does:

- **Local logic, no external service** → write a plugin
  ([docs/PLUGINS.md](PLUGINS.md)). Drop a folder with `plugin.json` +
  `index.js` into `plugins/`. No build step.
- **Talks to an external service** → run or write an MCP server and add it to
  `config/mcp.json` ([docs/MCP.md](MCP.md)). The MCP ecosystem already covers
  filesystem, fetch, GitHub, calendars, and more.

## Are plugins safe?

Plugins run with full Node process privileges — the sandbox is an *error*
boundary (timeouts, crash isolation), not a *security* boundary. Treat
plugins like VS Code extensions or npm dependencies: install only ones you
trust. See [SECURITY.md](../SECURITY.md).

## Is voice supported?

Not yet. STT + TTS is on the mid-term roadmap (3–6 months). The stub
directories were removed before v1.0 so the package wouldn't ship dead code.

## Can I use this for work?

The code is MIT-licensed — yes. The semantic memory + tool-confirmation
gating make it a reasonable assistant for code reading, drafting, research,
and documentation. The wider warning: prompt injection through web search
results is mitigated but not solved. Don't run untrusted instructions through
tools you don't want executed.

## Why TypeScript?

It's the largest community for AI tooling outside of Python, runs on every
platform Node runs on, and lets the provider interface stay strictly typed.
Python is a more obvious fit for ML research; TypeScript is a better fit for
this kind of streaming, multi-provider, tool-using application code.

## How do I switch providers?

```
/switch anthropic   # show env vars needed
/model claude-sonnet-4-6   # pins and updates .env automatically
```

The model command also infers the provider from the model name — typing
`/model qwen2.5:14b` switches to Ollama; `/model gpt-4o-mini` switches to
OpenAI. Provider state hot-swaps without a restart.

## Where do I report bugs?

Open an issue on GitHub. For security issues, use the private Security
Advisory flow on the repo — never a public issue.

## Is there a hosted version?

No, by design. Hosting it would defeat the local-first goal. You can run it
yourself in under five minutes — `npx @nandansai08/personal-ai` from the
README is the fastest path.

## How do I uninstall?

```
rm -rf ~/.personal-ai
npm uninstall -g @nandansai08/personal-ai   # if installed globally
```

Memories, sessions, logs, and config all live under `~/.personal-ai/`.
