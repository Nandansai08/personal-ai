# Contributing

Thanks for contributing to PersonalAI.

---

## Quick start

```bash
git clone https://github.com/Nandansai08/personal-ai.git
cd personal-ai
npm install
cp .env.example .env
npm run build
npm test
```

---

## Branch workflow

```bash
git checkout -b feat/your-feature   # or fix/your-fix
# make changes
npm run build && npm test           # must pass
git push origin feat/your-feature
# open PR against main
```

Branch naming: `feat/`, `fix/`, `docs/`, `refactor/`, `test/`

Commit style: `feat(scope): short description` — no "Claude" or AI attribution in messages.

---

## Code rules

- **TypeScript strict mode** — no `any` types
- **No provider SDK imports** outside `src/providers/*.ts`
- **Errors as values** — never throw across module boundaries; return `{ success, data, error }`
- **MIT license header** in every `src/` file
- **No comments** unless the WHY is non-obvious
- Tests in `tests/` mirroring `src/` structure
- Run `npx fallow` before committing — fix dead-code and unused-export warnings

---

## Adding a Provider

Follow this checklist:

- [ ] Create `src/providers/<name>.ts` implementing `LLMProvider`
- [ ] Export class with `// fallow-ignore-next-line unused-export` (loaded via dynamic import)
- [ ] Read config from `process.env` only — no hardcoded keys
- [ ] `async *chat()` yields `ChatChunk` union types: `text`, `tool_call`, `done`, `error`
- [ ] Emit `eventBus.emit('provider_latency', ...)` after each request
- [ ] Implement `healthCheck()` and `listModels()` if the API supports it
- [ ] Register in `src/providers/factory.ts`: add to `ProviderName` union, `PROVIDER_INFO`, and `loadProvider()`
- [ ] Add env vars to `.env.example`
- [ ] Add entry to `docs/PROVIDERS.md`
- [ ] Write tests in `tests/providers/<name>.test.ts` (mock fetch/SDK)
- [ ] Run `npx tsc --noEmit` and `npm test`

**Streaming rule:** accumulate tool call deltas (name + arguments) across chunks before yielding a `tool_call` chunk. See `openai-compatible.ts` for the delta accumulation pattern.

**SDK rule:** use `dynamic import()` inside `loadProvider()` — not top-level imports — so unused SDKs don't load at startup.

---

## Adding a Tool

- [ ] Create `src/tools/<name>.ts` exporting a `RegisteredTool`
- [ ] Define `ToolDefinition` with `name`, `description`, and JSON Schema `parameters`
- [ ] Implement `execute(args)` returning `ToolResult` — never throw
- [ ] Keep `description` under 80 characters (injected into system prompt)
- [ ] Register in `src/index.ts`: `toolRegistry.register(myTool)`
- [ ] Write tests in `tests/tools/<name>.test.ts`

---

## Adding a Profile

Edit `config/profiles.yaml`:

```yaml
profiles:
  myprofile:
    name: "My Profile"
    description: "One line shown in /profile list"
    system_addon: |
      Additional system prompt instructions for this mode.
    preferred_model: "qwen2.5:14b"   # optional
    tools_priority:
      - web_search
      - notes
    temperature: 0.7
```

No code change needed — profiles hot-reload at runtime.

---

## Running tests

```bash
npm test                    # run all tests
npm test -- --watch         # watch mode
npm test tests/tools/       # single directory
```

Tests use vitest. Mock external APIs — don't make real HTTP calls in tests.

---

## Pull request checklist

- [ ] `npm run build` passes
- [ ] `npm test` passes (all tests green)
- [ ] `npx tsc --noEmit` has no errors
- [ ] New files have MIT license header
- [ ] `.env.example` updated if new env vars added
- [ ] `docs/PROVIDERS.md` updated if new provider added
- [ ] PR description explains what and why

---

## Reporting bugs

Open an issue with:
- OS and Node.js version
- Provider and model
- Steps to reproduce
- Expected vs actual behavior
- Relevant log output (`/logs` in CLI shows the path)
