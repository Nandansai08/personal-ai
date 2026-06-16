# Reddit launch posts

Two variants — one for r/LocalLLaMA (technical, model-focused), one for
r/selfhosted (sysadmin / privacy-focused). Adjust headline + closing line.

---

## r/LocalLLaMA

### Title

```
PersonalAI v1.0 — local-first assistant with auto-routing between qwen2.5:14b and gemma3:12b, semantic memory, MCP, plugins (TypeScript, MIT)
```

### Body

Shipped v1.0 of a personal assistant designed for the 16 GB-laptop case
the cloud-first products keep ignoring. Default setup is two Ollama models
with per-message auto-routing:

- `qwen2.5:14b` for tools, coding, reasoning
- `gemma3:12b` for chat, long context, quick replies

`ModelManager` classifies each message and hot-switches without reloading.
`keep_alive: -1` keeps both in VRAM so first-token latency stays low.

What's actually interesting if you spend time with local models:

- **Native tool use on qwen2.5:14b, llama3.1, mistral-nemo** — no XML
  fallback. For Gemma 3 / phi, the loop injects two-tag XML instructions
  (`<tool>name</tool><args>{…}</args>`) and parses them out.
- **Semantic memory** uses `nomic-embed-text` via Ollama's embeddings
  endpoint. Hybrid retrieval scores 70 % cosine + 20 % importance + 10 %
  recency. Brute-force search at ~25 ms over 5 K rows; swap for sqlite-vec
  only if you cross 100 K.
- **MCP client** speaks newline-delimited JSON-RPC over stdio — no SDK.
  Any MCP server config you have for Claude Desktop drops in. Tools
  register as `mcp_<server>_<name>` and confirm before each call.
- **Plugins** are plain ESM modules. Drop `plugin.json` + `index.js`, hot-
  reload. Sandbox is an error boundary (2 s timeout, crash isolation),
  not a security boundary.

Provider abstraction is real — same code path for Ollama, Anthropic,
OpenAI, Groq, Gemini, Mistral, LM Studio, Together. Switch with
`/model qwen2.5:14b` and `.env` is patched automatically.

Tested with qwen2.5:14b + qwen2.5-coder:7b + gemma3:12b + nomic-embed-text
on a Ryzen 7 + 16 GB + RTX 4060 setup. Cold start ~280 ms, first token
2–5 s after both models warm up.

Install:

```
npx @nandansai08/personal-ai
```

Docker compose with Ollama + model pull included:

```
git clone https://github.com/Nandansai08/personal-ai
cd personal-ai
docker compose up
```

Repo: https://github.com/Nandansai08/personal-ai

Happy to dig into the tool-call streaming code, the memory dedup rules, or
the provider abstraction in comments.

---

## r/selfhosted

### Title

```
PersonalAI — self-hosted ChatGPT alternative, runs locally on Ollama, MIT licensed, one Docker compose
```

### Body

A self-hosted AI assistant for people who want to keep their conversations
on their own hardware. Runs as a single Docker compose: Ollama + the
PersonalAI web service, both behind 127.0.0.1.

What you get:

- Streaming chat (Express + WebSocket)
- Persistent memory at `~/.personal-ai/memory.db` (SQLite WAL) — survives
  restarts and Docker volume mounts
- A web UI bound to loopback only, every API request gated by a per-
  session bearer token (constant-time compared), Host + Origin checks
- File-reader tool restricted to allowed roots; credentials (`.env`, SSH
  keys, `.pem`/`.key`) always denied even with the allowlist
- Per-call confirmation card in the web UI for dangerous tools
- Daily log file at `~/.personal-ai/logs/`

What you don't get (deliberately):

- Multi-tenancy. This is a single-user assistant by design.
- Account/auth backends. Token-on-launch only.
- Telemetry. None in v1.0.

What you can extend:

- MCP servers (any from the standard ecosystem) via `config/mcp.json`
- Custom local plugins — drop a folder, no build step
- Any of 8 providers if you'd rather not run Ollama locally
  (Anthropic, OpenAI, Groq, Gemini, Mistral, LM Studio, Together)

Quick start:

```
git clone https://github.com/Nandansai08/personal-ai
cd personal-ai
docker compose up
```

The compose file pulls `qwen2.5:14b`, `gemma3:12b`, and
`nomic-embed-text` automatically on first boot, persists everything to
named volumes, and binds the web UI to `127.0.0.1:3000` only.

For a reverse-proxy + auth setup (not the default, you opt in), the
security model is documented in
[SECURITY.md](https://github.com/Nandansai08/personal-ai/blob/main/SECURITY.md).

Repo: https://github.com/Nandansai08/personal-ai
License: MIT

Glad to discuss the threat model, container hardening, or the memory
storage layout in comments.
