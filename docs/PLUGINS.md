# Plugin System

Plugins extend PersonalAI **locally**: custom tools, prompt/response hooks,
and lifecycle handlers — without modifying core code.

**Plugins vs MCP:** plugins are for local custom extensions, community
extensions, and user-defined tools. MCP (M9 roadmap) is for external
integrations, remote tools, and third-party services. If your extension
talks to an external service, build an MCP server instead.

## Quick start

```
plugins/
└── my-plugin/
    ├── plugin.json
    ├── index.js
    └── README.md
```

Plugin directories are scanned from:
1. `<package root>/plugins/`
2. `~/.personal-ai/plugins/`
3. `PLUGINS_DIR` env var (overrides both)

`plugin.json`:

```json
{
  "name": "my-plugin",
  "version": "1.0.0",
  "description": "What it does",
  "main": "./index.js",
  "enabled": true
}
```

All five fields are required. `name` must be kebab-case; `main` must be a
`.js` ESM module inside the plugin directory. Invalid manifests are rejected
with a logged reason and never crash startup.

`index.js` (plain ESM JavaScript — no build step):

```js
/** @type {import('../../src/plugins/types.js').PersonalAIPlugin} */
const plugin = {
  name: 'my-plugin',
  version: '1.0.0',
  description: 'What it does',

  tools: [{
    definition: {
      name: 'my_tool',
      description: 'What the model sees',
      parameters: { type: 'object', properties: {} },
    },
    async execute(args) {
      return { success: true, data: 'result' }
    },
  }],

  hooks: {
    async beforePrompt(prompt) { return prompt },
    async afterResponse(response) { return response },
    async beforeToolCall(name, args) {},
    async afterToolCall(name, result) {},
    async memoryStored(memory) {},
    async sessionStarted() {},
    async sessionEnded() {},
  },

  async initialize() {},
  async shutdown() {},
}

export default plugin
```

## Lifecycle

1. Startup scans plugin directories and validates each `plugin.json`.
2. Enabled plugins are imported; `initialize()` runs (5 s timeout).
3. Tools register into the shared tool registry — they appear in `/tools`
   and are callable by the assistant immediately.
4. Hooks register into the hook runner.
5. On `/plugins disable <name>` or shutdown, `shutdown()` runs and the
   plugin's tools/hooks are removed.

## Hooks

| Hook | When | Contract |
|---|---|---|
| `beforePrompt` | before each model call | return the (possibly modified) system prompt |
| `afterResponse` | after the response completes | return the (possibly modified) text — applies to stored context; streamed text is already displayed |
| `beforeToolCall` | before a tool executes | observe only |
| `afterToolCall` | after a tool returns | observe only |
| `memoryStored` | when a memory is saved | observe only |
| `sessionStarted` / `sessionEnded` | CLI session boundaries | observe only |

Hooks run inside a sandbox: **2-second timeout**, errors caught and logged.
A failing hook keeps the previous value in transform chains and bumps the
plugin's failure count (visible in `/plugins health`). Plugins can degrade —
they can never take the assistant down.

## CLI

```
/plugins                  list plugins and status
/plugins health           status + versions, tool/hook counts, failures
/plugins reload [name]    reload from disk (picks up code changes)
/plugins enable <name>    enable + persist to plugin.json
/plugins disable <name>   disable + persist to plugin.json
```

The web UI exposes the same data read-only at `GET /api/plugins`.

## Best practices

- One concern per plugin; keep tools small and return errors as values
  (`{ success: false, error }`) — never throw.
- Tools that touch the filesystem or network should set
  `requiresConfirmation: true` so the CLI confirm gate applies.
- Keep hooks fast — anything over 2 s is cut off.
- Don't mutate the prompt destructively in `beforePrompt`; append.
- Ship a README per plugin (see `plugins/hello-world/`).

## Examples

- `plugins/hello-world/` — tool + beforePrompt hook
- `plugins/timestamp/` — minimal single-tool plugin
