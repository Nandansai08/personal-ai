# Build your first plugin

Five minutes from `mkdir` to "the assistant just used my tool".

Plugins add custom tools and hooks to PersonalAI without modifying the core.
Plain ESM JavaScript, no build step, no transpiler.

## What we're building

A plugin that registers one tool: `urban_dict(term)` — looks up a slang term
on a public API and returns the top definition. Demonstrates:

- A `plugin.json` manifest
- A tool definition with parameters
- An async `execute` that calls an external API
- Returning errors as values (never throwing)

## 1. Create the plugin folder

```bash
mkdir -p plugins/urban-dict
cd plugins/urban-dict
```

## 2. Write the manifest

`plugins/urban-dict/plugin.json`:

```json
{
  "name": "urban-dict",
  "version": "1.0.0",
  "description": "Look up slang via the Urban Dictionary public API",
  "main": "./index.js",
  "enabled": true
}
```

Manifest rules:

- `name` must be kebab-case (`[a-z0-9-]+`)
- `version` must look like semver
- `main` must end in `.js` and live inside the plugin folder
- `enabled: false` is fine; users can flip with `/plugins enable urban-dict`

## 3. Write the plugin module

`plugins/urban-dict/index.js`:

```js
// @ts-check

/** @type {import('../../src/plugins/types.js').PersonalAIPlugin} */
const plugin = {
  name: 'urban-dict',
  version: '1.0.0',
  description: 'Look up slang via the Urban Dictionary public API',

  tools: [
    {
      // No filesystem or network credentials needed — safe to auto-run
      requiresConfirmation: false,
      definition: {
        name: 'urban_dict',
        description: 'Look up the top Urban Dictionary definition for a slang term.',
        parameters: {
          type: 'object',
          properties: {
            term: { type: 'string', description: 'The term to look up' },
          },
          required: ['term'],
        },
      },
      async execute(args) {
        const term = args && typeof args === 'object' && 'term' in args ? String(args.term) : ''
        if (!term) {
          return { success: false, data: null, error: 'term is required' }
        }
        try {
          const res = await fetch(
            `https://api.urbandictionary.com/v0/define?term=${encodeURIComponent(term)}`,
            { signal: AbortSignal.timeout(5000) },
          )
          if (!res.ok) {
            return { success: false, data: null, error: `HTTP ${res.status}` }
          }
          const data = await res.json()
          const top = (data.list || [])[0]
          if (!top) {
            return { success: true, data: { term, definition: 'No definition found.' } }
          }
          return {
            success: true,
            data: {
              term: top.word,
              definition: top.definition.slice(0, 600),
              example: top.example?.slice(0, 300) ?? '',
              upvotes: top.thumbs_up,
            },
          }
        } catch (err) {
          return { success: false, data: null, error: err instanceof Error ? err.message : String(err) }
        }
      },
    },
  ],
}

export default plugin
```

## 4. Restart PersonalAI

```bash
npm start
```

You should see, near the top of the boot output:

```
✓ Plugin: urban-dict loaded

1 plugin active
```

If you see `⚠ Plugin urban-dict failed: …`, the manager logged exactly why.
Common causes: missing `enabled` field, `main` pointing to a missing file,
or a syntax error in `index.js`.

## 5. Try the tool

```
[qwen2.5:14b] > look up "yeet" on Urban Dictionary
  ⟳ urban_dict… ✓
"Yeet" — to throw with great force…
```

Or run it manually:

```
[qwen2.5:14b] > /tools
Registered tools (7):
  …
  urban_dict — Look up the top Urban Dictionary definition…
```

## 6. Edit and reload (no restart)

Change something in `index.js`, then:

```
[qwen2.5:14b] > /plugins reload urban-dict
✓ Reloaded urban-dict (healthy)
```

## What's next

- **Hooks.** Add a `hooks: { beforePrompt(p) { return p + ' …' } }` block to
  influence every model call. Useful for project-specific instructions.
- **Confirmation gate.** Set `requiresConfirmation: true` on any tool that
  touches the filesystem or sends data anywhere. CLI prompts y/N before
  each call; web UI shows an inline approve/deny card.
- **Sandbox.** Hooks have a 2-second timeout and crash boundary — a
  misbehaving plugin can't take the assistant down. The full security model
  is in [SECURITY.md](../../SECURITY.md).
- **Share it.** Open a PR adding your plugin name to `docs/AWESOME-PLUGINS.md`
  (when that lands; for now, the [issues backlog](../../.github/ISSUES_BACKLOG.md)
  has a `T4` ticket to create it).

Full reference: [docs/PLUGINS.md](../PLUGINS.md).
