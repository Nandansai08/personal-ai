# Production Readiness Checklist

What's done, what's outstanding, and what's deliberately out of scope.
Updated each release.

## Shipped (v1.0)

### Security
- [x] Web server bound to `127.0.0.1` only
- [x] Per-session bearer token, constant-time compared
- [x] Host header validation (DNS rebinding defense)
- [x] WebSocket Origin check
- [x] `file_reader` allowlist + credential denylist + symlink guard
- [x] Per-call tool confirmation (CLI + web inline card)
- [x] Memory anti-injection framing
- [x] API keys masked in setup wizard, header-only transport
- [x] Plugin trust model documented honestly
- [x] CHANGELOG mirrors actual code

### Code quality
- [x] TypeScript strict, no `any`
- [x] ESLint flat config, CI-enforced
- [x] 215+ tests across core, memory, providers, tools, web, plugins, MCP
- [x] Pure helpers extracted (cli-helpers.ts) for testability
- [x] Errors-as-values discipline; no `process.exit` outside entrypoints

### CI/CD
- [x] CI matrix: Ubuntu + Windows × Node 20 + 22
- [x] Release workflow: provenance npm publish + GitHub release on tag
- [x] Lock file pinned for `npm ci` integrity
- [x] Build verification step in release pipeline
- [x] `prepublishOnly` gate (typecheck + tests)

### Distribution
- [x] Published as `@nandansai08/personal-ai` on npm
- [x] `npx @nandansai08/personal-ai` zero-install path
- [x] Bin shim ships built JS, not ts-node
- [x] `~/.personal-ai/.env` fallback for npx installs
- [x] `--version` flag

### Documentation
- [x] README with quick-start, architecture, providers table
- [x] CONTRIBUTING, SECURITY, CODE_OF_CONDUCT
- [x] docs/ARCHITECTURE.md, PROVIDERS.md, PLUGINS.md, MCP.md
- [x] FAQ, ROADMAP, COMMUNITY
- [x] Issue + PR templates

## Outstanding (pre-1.1)

### High impact
- [ ] **Demo GIF** in README (human-recordable; 15s flow)
- [ ] **Docker image** (Dockerfile + Compose for Ollama + PersonalAI)
- [ ] **VS Code devcontainer** for one-click contributor setup
- [ ] **Mobile-tuned web UI** (current shell is responsive; chat interactions need touch polish)

### Quality
- [ ] Provider streaming tool blocks (Anthropic's content-block stream)
- [ ] Per-provider tool-message threading where supported (Anthropic
      `tool_use` + `tool_result` pairing) without breaking the safe downgrade
      path for orphan tool messages
- [ ] Auto-summarized memory rollups (compact low-importance memories)
- [ ] Web UI: prompt history (↑ in composer)

### Operational
- [ ] Configurable conversation-context budget (env or `/config`)
- [ ] Rate limiting on tool dispatch (e.g., max N file_reader calls per
      conversation) — defense in depth on top of the confirmation gate
- [ ] Telemetry opt-in (anonymous usage counters; never message content)

### Documentation
- [ ] Per-provider walkthrough videos / GIFs
- [ ] Migration guide (when v2 lands)
- [ ] Translation pipeline (currently English only)

## Deliberately out of scope for v1

- **Multi-tenancy / hosted version** — defeats the local-first goal.
- **Custom DSL for plugins** — keep plugins as plain ESM modules.
- **Built-in agent marketplace UI** — point to MCP servers + plugin
  directories instead.
- **Payment integrations** — none of this needs accounts.

## Performance baselines (current)

- Cold start (Node 20, no Ollama prewarm): ~280 ms to prompt
- Plugin discovery (2 plugins, manifest + import): ~12 ms
- Memory search, 5 K rows, tokenized LIKE: < 5 ms
- Semantic search, 5 K rows, brute-force cosine: ~25 ms
- Web UI first paint (LAN-side): ~110 ms after WS open

Goals for v1.1: hold all of the above; bring semantic search to < 10 ms via
batched cosine on Float32Arrays.

## Scalability notes

PersonalAI is single-user by design — these are useful upper bounds, not
production load targets:

- Memory DB: tested to 50 K rows on a 16 GB laptop, stays responsive.
- Plugin count: no hard limit; per-plugin tools dispatch independently. >100
  plugins would warrant a registry tree instead of a flat Map.
- Concurrent WS connections: tested with 5 simultaneous chats against a
  single Ollama backend; bottleneck is the model, not the server.

## Known limitations

- Provider tool-message threading is downgraded for compatibility — see
  CHANGELOG v1.0 notes.
- Embeddings depend on Ollama being reachable; the assistant falls back to
  keyword search gracefully but the user can be confused without checking
  `/memory stats`.
- Windows ARM64 has no `better-sqlite3` prebuild as of v1.0; users on those
  systems need node-gyp or to wait for upstream prebuild.
