#!/usr/bin/env node
// One-shot: open the v1.0 launch backlog as real GitHub issues via gh CLI.
// Idempotent: skips titles that already exist (open or closed).
//
// Run from repo root with the `gh` CLI authenticated:
//   node scripts/open-issues.mjs
//
// Set DRY=1 to print what would happen without creating anything.

import { execSync, spawnSync } from 'node:child_process'

const DRY = process.env.DRY === '1'

const ISSUES = [
  {
    title: 'Record and embed demo GIF',
    labels: ['documentation', 'good first issue'],
    body: `README has a placeholder. A 15-second loop showing CLI → "remember …" → web UI is the highest-leverage README change for adoption.

**Acceptance criteria:**
- \`docs/demo.gif\` exists, under 5 MB
- README image link no longer 404s
- Loop shows: cold start, one chat exchange, one memory save (with confirmation line), opening the web UI

**Technical notes:** Tools — \`terminalizer\`, \`asciinema-agg\`, or screen recording + \`ffmpeg -i in.mp4 -vf "fps=15,scale=900:-1" out.gif\`. Keep under 5 MB so the README loads fast.

Difficulty: 🟢 easy`,
  },
  {
    title: 'Add Mermaid sequence diagram of the agent loop in ARCHITECTURE.md',
    labels: ['documentation', 'good first issue'],
    body: `README now has a Mermaid component diagram. ARCHITECTURE.md should gain a Mermaid sequence diagram for the agent loop — currently the most opaque part of the system in docs.

**Acceptance criteria:**
- New \`sequenceDiagram\` block in \`docs/ARCHITECTURE.md\` showing: user message → memory search → model selection → provider chat → tool dispatch (with confirm gate) → context update → response
- Renders correctly on GitHub

**Notes:** Keep the existing ASCII diagram below as a fallback for terminal viewers.

Difficulty: 🟢 easy`,
  },
  {
    title: 'Add more plugin tutorials beyond first-plugin.md',
    labels: ['documentation', 'plugins', 'good first issue'],
    body: `\`docs/tutorials/first-plugin.md\` covers a basic tool-only plugin. Need follow-ups:

**Acceptance criteria:**
- \`docs/tutorials/plugin-hooks.md\` — building a plugin that uses \`beforePrompt\` + \`memoryStored\` hooks
- \`docs/tutorials/plugin-with-confirmation.md\` — building a tool that requires the confirmation gate (filesystem write example)

**Notes:** Reuse the \`hello-world\` and \`weather\` examples as starting points.

Difficulty: 🟢 easy`,
  },
  {
    title: 'Tutorial: connect your first MCP server',
    labels: ['documentation', 'mcp', 'good first issue'],
    body: `\`docs/MCP.md\` is reference, not narrative. A walkthrough shortens the on-ramp.

**Acceptance criteria:**
- New \`docs/tutorials/first-mcp.md\`
- Pick one official MCP example server (e.g. \`mcp-server-fetch\` or \`mcp-server-filesystem\`)
- Copy-paste \`config/mcp.json\` that works end-to-end
- Show the assistant calling the new tool with the confirmation card
- Under 5 minutes from clone to working

Difficulty: 🟢 easy`,
  },
  {
    title: 'Per-OS install troubleshooting doc',
    labels: ['documentation', 'help wanted'],
    body: `Windows ARM64, macOS Gatekeeper, Linux SELinux all hit different sharp edges. One page collects them.

**Acceptance criteria:**
- New \`docs/INSTALL.md\`
- Sections per OS: macOS / Linux / Windows
- Each lists the 2–3 most common errors users hit, with the fix
- Linked from README install section

Difficulty: 🟢 easy`,
  },
  {
    title: 'Generate CONTRIBUTORS.md from git log',
    labels: ['documentation', 'good first issue'],
    body: `Recognition matters; manual contributor lists rot.

**Acceptance criteria:**
- New \`CONTRIBUTORS.md\` at repo root
- Generator script in \`scripts/contributors.mjs\` that runs \`git shortlog -sne\` and writes the markdown file
- Documented in CONTRIBUTING.md: maintainers run it before each release

**Notes:** Dedupe by email; preserve handles where commit authors include them.

Difficulty: 🟢 easy`,
  },
  {
    title: 'Prompt history (↑/↓ in web composer)',
    labels: ['frontend', 'enhancement', 'good first issue'],
    body: `Every CLI has it; the web composer doesn't.

**Acceptance criteria:**
- ↑ in an empty composer recalls the previous user message
- ↑/↓ cycle through the last 50 messages of the current session
- Mid-edit (composer not empty), ↑/↓ behave as normal arrow keys
- Esc resets to a blank composer

**Notes:** State already has \`state.lastUserMsg\` — extend to a 50-entry ring buffer in \`state\`.

Files: \`src/ui/web/client/index.html\`

Difficulty: 🟢 easy`,
  },
  {
    title: 'Markdown table rendering in chat',
    labels: ['frontend', 'good first issue'],
    body: `Model output often uses pipe tables; the renderer dumps them as paragraphs.

**Acceptance criteria:**
- GFM tables (\`| a | b |\` / \`|---|---|\` / rows) render as \`<table>\`
- Header row styling; monospace cells; horizontal scroll on overflow
- Snapshot test covering: simple table, table with code in cells, table with empty cells
- Existing \`renderMarkdown\` tests still pass

Files: \`src/ui/web/client/index.html\` — \`renderMarkdown\` function

Difficulty: 🟢 easy`,
  },
  {
    title: 'Session search in the chat panel',
    labels: ['frontend', 'good first issue'],
    body: `Once a user has 30+ sessions, scrolling fails.

**Acceptance criteria:**
- Search input above \`#sess-list\`
- Filters by session name + preview substring (case-insensitive)
- Empty search shows all
- Esc clears the search

Files: \`src/ui/web/client/index.html\`

Difficulty: 🟢 easy`,
  },
  {
    title: 'Keyboard-shortcuts modal',
    labels: ['frontend', 'enhancement'],
    body: `Discoverability of Ctrl+K, ↑/↓ in composer, send vs newline.

**Acceptance criteria:**
- \`?\` (when composer is unfocused) opens a modal listing every shortcut
- Modal closes on Esc or backdrop click
- New shortcuts auto-appear (single source of truth in JS)

Difficulty: 🟢 easy`,
  },
  {
    title: 'Voice input placeholder button',
    labels: ['frontend', 'good first issue'],
    body: `Sets up the v1.x voice milestone visually without shipping STT.

**Acceptance criteria:**
- Mic icon button in the composer bar
- Clicking shows a toast: "Voice arrives in v1.x — track #<voice-issue-number>"
- Toast links to the roadmap

Difficulty: 🟢 easy`,
  },
  {
    title: 'Download buttons for code blocks',
    labels: ['frontend', 'good first issue'],
    body: `Copy is good; downloading as a file is better.

**Acceptance criteria:**
- Each code block has Copy + Download buttons (visible on hover)
- Download infers extension from the language tag (\`\`\`ts → .ts; \`\`\`python → .py; default .txt)

Difficulty: 🟢 easy`,
  },
  {
    title: 'Render tool results collapsed by default',
    labels: ['frontend', 'enhancement'],
    body: `Long tool outputs steal the chat view.

**Acceptance criteria:**
- Tool result panel renders inside \`<details>\`, collapsed initially
- Summary line shows tool name + character count + status (✓ / ✗)
- Clicking expands

Difficulty: 🟢 easy`,
  },
  {
    title: 'VS Code devcontainer for one-click contributor setup',
    labels: ['backend', 'good first issue'],
    body: `**Acceptance criteria:**
- \`.devcontainer/devcontainer.json\` + \`.devcontainer/Dockerfile\`
- Installs Node 20, runs \`npm install\` on attach
- (Optional) pulls baseline Ollama models if \`OLLAMA_PREFETCH=on\`
- README mentions "Open in VS Code → Reopen in Container"

Difficulty: 🟢 easy`,
  },
  {
    title: 'Configurable conversation budget via env',
    labels: ['backend', 'good first issue'],
    body: `\`MAX_CONTEXT_CHARS\` is hardcoded at 24 K. Users with 128 K-context models want to raise it; 8 GB users want to lower it.

**Acceptance criteria:**
- \`MAX_CONTEXT_CHARS\` env override is read at startup
- \`MAX_TOOL_RESULT_CHARS\` also overridable
- \`/cost\` output includes the active values
- Test covering both env-set and default cases

Files: \`src/core/assistant.ts\`

Difficulty: 🟢 easy`,
  },
  {
    title: 'Web server graceful shutdown on SIGINT',
    labels: ['backend', 'good first issue'],
    body: `Ctrl+C currently kills mid-stream; the WS client sees a hard close.

**Acceptance criteria:**
- SIGINT closes the listener
- Sends \`{type:'shutdown'}\` to every open WebSocket
- Drains for ≤ 5 s, then exits
- Client logs "server going down" toast on receipt

Files: \`src/ui/web/server.ts\`, \`src/index.ts\`, \`src/ui/web/client/index.html\`

Difficulty: 🟢 easy`,
  },
  {
    title: 'Extend the weather plugin with hourly forecasts',
    labels: ['plugins', 'good first issue', 'enhancement'],
    body: `\`plugins/weather/\` ships with current + 3-day forecast via Open-Meteo. Extend.

**Acceptance criteria:**
- New parameter \`hourly: boolean\` (default false)
- When true, return the next 12 hours of temperature + weather code instead of daily aggregates
- Update \`plugins/weather/README.md\` with example queries

Files: \`plugins/weather/index.js\`, \`plugins/weather/README.md\`

Difficulty: 🟢 easy`,
  },
  {
    title: 'Example plugin: GitHub (read-only)',
    labels: ['plugins', 'good first issue'],
    body: `Shows a plugin with one env var; the most-requested integration.

**Acceptance criteria:**
- New \`plugins/github/\` with \`plugin.json\` + \`index.js\` + \`README.md\`
- Reads \`GITHUB_TOKEN\` from \`process.env\`
- Tools: \`github_search_issues(query)\`, \`github_repo_info(owner/repo)\`
- \`requiresConfirmation: false\` (read-only)
- 5 s fetch timeouts; errors-as-values

Files: \`plugins/github/*\`

Difficulty: 🟢 easy`,
  },
  {
    title: 'Example plugin: calendar (icalendar URL → upcoming events)',
    labels: ['plugins', 'good first issue'],
    body: `Personal AI without calendar is incomplete.

**Acceptance criteria:**
- New \`plugins/calendar/\` with \`plugin.json\` + \`index.js\` + \`README.md\`
- Reads \`CALENDAR_URL\` from \`process.env\` (any public ICS URL)
- Tool: \`upcoming_events(n)\` returns the next N events
- Uses \`node-ical\` or a tiny ICS parser (no native deps)

Files: \`plugins/calendar/*\`

Difficulty: 🟢 easy`,
  },
  {
    title: 'Create AWESOME-PLUGINS.md community-plugins list',
    labels: ['documentation', 'plugins'],
    body: `Plugins are pointless without discovery.

**Acceptance criteria:**
- New \`docs/AWESOME-PLUGINS.md\`
- Sections: Built-in (hello-world, timestamp, weather) / Community
- Submission template (1 line each): name, link, author, what it does
- PR guidelines: must include a README and explicit \`requiresConfirmation\` choice

Difficulty: 🟢 easy`,
  },
  {
    title: 'Pretty-print known tool result shapes',
    labels: ['frontend', 'good first issue'],
    body: `Right now tool results render as JSON dumps. Pretty-print known shapes.

**Acceptance criteria:**
- \`web_search\` results: title + URL + snippet, one row each, URL clickable
- \`notes\` results: markdown rendering
- \`tasks\` results: a small table with status + due
- Unknown shapes still fall back to monospace JSON

Files: \`src/ui/web/client/index.html\` — \`tool-result\` renderer

Difficulty: 🟢 easy`,
  },
  {
    title: 'Audit log of every tool call',
    labels: ['security', 'good first issue'],
    body: `Users should be able to see "what did the assistant do with my filesystem this week?"

**Acceptance criteria:**
- \`~/.personal-ai/audit.log\` append-only file
- One JSON line per tool call: \`{timestamp, tool, args_hash, success}\`
- Args hashed (SHA-256, hex) so sensitive arguments don't land in plaintext
- New CLI command \`/audit\` prints the last 20 entries
- Log file size capped at 10 MB; rotated daily

Difficulty: 🟢 easy`,
  },
  {
    title: 'Limit per-message memory writes',
    labels: ['security', 'good first issue'],
    body: `A misbehaving model could spam memory.

**Acceptance criteria:**
- New const \`MAX_MEMORY_WRITES_PER_TURN\` (default 5)
- Counter resets per \`chat()\` call
- Writes beyond the limit log a warning and are dropped (memory_tool returns \`success: false\`)
- Test covering: 4 writes ok, 6th write rejected

Files: \`src/core/assistant.ts\` or \`src/tools/memory-tool.ts\`

Difficulty: 🟢 easy`,
  },
  {
    title: 'Configurable timeout per tool',
    labels: ['security', 'good first issue'],
    body: `A blocked MCP server can stall the chat for the full 30 s.

**Acceptance criteria:**
- New optional \`timeoutMs\` field on \`RegisteredTool\` (default 30 s)
- Registry races \`tool.execute\` against the timeout
- On timeout: returns \`{success: false, error: 'tool timeout (Xms)'}\`; the tool process is NOT killed
- Test covering: tool returning in time, tool timing out

Files: \`src/tools/types.ts\`, \`src/tools/registry.ts\`

Difficulty: 🟢 easy`,
  },
  {
    title: 'Strict CORS allowlist on the web server',
    labels: ['security', 'good first issue'],
    body: `Currently \`cors({ origin: localhost:PORT })\`; the Host check is the real defense. Lock CORS too.

**Acceptance criteria:**
- Reject any non-localhost origin outright (no \`Access-Control-Allow-Origin\` echoing)
- Document remote-proxy setup in SECURITY.md
- Web-security tests cover: localhost origin allowed, foreign origin rejected at CORS preflight

Files: \`src/ui/web/server.ts\`, \`tests/ui/web-security.test.ts\`

Difficulty: 🟢 easy`,
  },
  {
    title: 'Snapshot tests for markdown renderer',
    labels: ['testing', 'security', 'good first issue'],
    body: `The XSS-safe \`renderMarkdown\` function is critical; regressions here are security incidents.

**Acceptance criteria:**
- New \`tests/ui/markdown.test.ts\`
- Cases: plain text, code blocks (with and without language), bold/italic, h1/h2/h3, ul/ol/nested, links, raw \`<script>\` (must be escaped, not executed)
- Test extracts the renderer into a shared module the test can import

**Notes:** \`renderMarkdown\` currently lives inline in \`index.html\`. Extract to a tiny file.

Difficulty: 🟢 easy`,
  },
  {
    title: 'Clearer error when nomic-embed-text not pulled',
    labels: ['bug', 'good first issue'],
    body: `Right now the assistant silently degrades to keyword search; the user can't tell the embedder failed.

**Acceptance criteria:**
- First memory save without a usable embedder logs once, clearly: "Semantic search is off — pull nomic-embed-text in Ollama to enable. Falling back to keyword search."
- \`/memory stats\` already shows the index status — link to it from the hint

Files: \`src/memory/embeddings.ts\`, \`src/memory/long-term.ts\`

Difficulty: 🟢 easy`,
  },
  {
    title: 'Plugin loader: better error when export shape is wrong',
    labels: ['bug', 'good first issue', 'plugins'],
    body: `Current error: \`module must export a PersonalAIPlugin as default or 'plugin'\`. Doesn't say what was exported.

**Acceptance criteria:**
- Error message includes \`Object.keys(mod).join(', ')\`
- If a likely candidate exists (e.g. \`default\` exported but lacks \`name\`), mention which required field is missing

Files: \`src/plugins/loader.ts\`

Difficulty: 🟢 easy`,
  },
  {
    title: 'Memory getStats() should cache',
    labels: ['performance', 'good first issue'],
    body: `\`getStats()\` is O(N) over all rows. Fine until 100 K memories; then \`/memory\` lags.

**Acceptance criteria:**
- Cache \`MemoryStats\` in memory
- Invalidate on save/archive
- Test confirms second call is faster than first by at least 10×

Files: \`src/memory/long-term.ts\`

Difficulty: 🟢 easy`,
  },
  {
    title: 'Sessions: prune oldest beyond N',
    labels: ['enhancement', 'good first issue'],
    body: `Sessions never auto-prune; the directory can grow.

**Acceptance criteria:**
- New CLI command \`/sessions prune [N]\` (default 50) archives oldest beyond N to a \`sessions/archive/\` subdir
- \`/sessions\` (or \`/load\` with no name) shows total session count + disk usage

Files: \`src/ui/commands.ts\`

Difficulty: 🟢 easy`,
  },
  {
    title: 'Docker image + docker-compose for Ollama + PersonalAI',
    labels: ['backend', 'enhancement'],
    body: `\`Dockerfile\` and \`docker-compose.yml\` shipped in v1.0; need to verify and polish.

**Acceptance criteria:**
- Push the image to Docker Hub (or GHCR) on each release tag
- Test \`docker compose up\` from a clean clone on Linux + Windows
- README install section gains a Docker tab pointing to the compose
- Document model-prefetch behavior

Files: \`Dockerfile\`, \`docker-compose.yml\`, \`.github/workflows/release.yml\`

Difficulty: 🟡 medium`,
  },
  {
    title: 'Light theme toggle',
    labels: ['frontend', 'enhancement'],
    body: `Dark is great; light is essential for some users and demos.

**Acceptance criteria:**
- Toggle in Settings, persists to \`localStorage\`, no flash-of-wrong-theme on reload
- All views readable in light mode

**Notes:** Tokens are at the top of the stylesheet — flip them in a \`:root[data-theme=light]\` rule.

Difficulty: 🟡 medium`,
  },
  {
    title: 'KaTeX math rendering',
    labels: ['frontend', 'enhancement'],
    body: `Tutoring and STEM use cases need math.

**Acceptance criteria:**
- \`$x^2 + y^2 = z^2$\` and \`$$\\sum_{i=0}^{n} i^2$$\` render via KaTeX
- Falls back to raw on parse failure
- KaTeX vendored as a static asset (no CDN — offline-first)

Difficulty: 🟡 medium`,
  },
  {
    title: 'Inline citation links for web_search results',
    labels: ['frontend', 'ai'],
    body: `Right now the model summarizes; the user can't click through.

**Acceptance criteria:**
- When a \`web_search\` tool result is in context, the assistant's response renders \`[1]\` superscripts that link to the source URLs
- Sources list rendered at the message footer
- Engine passes structured results; client keeps a per-message URL list

Difficulty: 🟡 medium`,
  },
  {
    title: 'Plugin hot-reload on file change',
    labels: ['backend', 'plugins', 'enhancement'],
    body: `Developers currently \`/plugins reload\` manually.

**Acceptance criteria:**
- \`chokidar\` watch on plugin entry files; debounce 500 ms; auto-reload that plugin
- Opt-in via env (\`PLUGIN_HOT_RELOAD=on\`) so production users aren't surprised
- Test: edit a plugin file, observe re-import within 1 s

Difficulty: 🟡 medium`,
  },
  {
    title: 'Conversation branching: edit a user message and resend',
    labels: ['frontend', 'ai', 'enhancement'],
    body: `Editing a user message and resending is currently destructive.

**Acceptance criteria:**
- "Edit" on a user message rewinds context to that point and lets the user re-send
- New \`truncate(messageIndex)\` method on \`ConversationContext\`
- UI: clicking Edit puts the message back in the composer; submitting truncates and replays

Difficulty: 🟡 medium`,
  },
  {
    title: 'CSP + nonce-based scripts on the web UI',
    labels: ['security', 'frontend'],
    body: `Defense in depth on top of loopback bind. No external assets today, but \`<script>\` is inline.

**Acceptance criteria:**
- \`Content-Security-Policy\` header allowing \`'self'\` + per-load nonce
- \`<script>\` becomes \`<script nonce="…">\` or moves to \`/app.js\`
- Existing web-security tests still pass

Difficulty: 🟡 medium`,
  },
  {
    title: 'Local document RAG',
    labels: ['ai', 'backend'],
    body: `"Chat with my files" — the embeddings infra is already there.

**Acceptance criteria:**
- New tool \`read_documents\` that indexes a directory
- Queries hit the same vector store with a separate collection
- Chunk on paragraph boundaries; respect a per-collection size cap
- Citation rendering in the chat (link with #B33 above)

Difficulty: 🔴 hard`,
  },
  {
    title: 'Knowledge graph layer for memories',
    labels: ['ai', 'architecture'],
    body: `Flat memories don't capture relationships ("Nandan → studies at → IIT Dhanbad"). A graph layer enables timeline + topic clustering.

**Acceptance criteria:**
- \`src/memory/graph.ts\` with \`Entity\`, \`Relation\` tables
- \`/memory graph <query>\` renders a small subgraph in CLI
- Web UI: Memory tab gains a graph visualization

**Notes:** Start tiny — entities only when a memory explicitly mentions them.

Difficulty: 🔴 hard`,
  },
  {
    title: 'Anthropic native tool_use / tool_result threading',
    labels: ['backend', 'ai'],
    body: `Better quality on Claude when the model can pair its own tool_use with the result.

**Acceptance criteria:**
- When the prior assistant message contains tool_use blocks, thread matching tool_result blocks back as native content blocks (not orphan text)
- Fall back to text downgrade when conversation has no prior tool_use (e.g., loaded sessions)

Difficulty: 🔴 hard`,
  },
  {
    title: 'Auto-summarized memory rollups',
    labels: ['ai', 'backend'],
    body: `Memory grows monotonically. Old low-importance memories should compact.

**Acceptance criteria:**
- Background job (manual \`/memory rollup\` first; later cron-style): groups same-type, low-importance, low-access memories
- Produces a single summary memory; archives originals
- Configurable threshold (default: importance ≤ 4, access ≤ 1, age ≥ 30 days)

Difficulty: 🔴 hard`,
  },
]

function existing() {
  const out = execSync('gh issue list --state all --limit 500 --json title', { encoding: 'utf8' })
  return new Set(JSON.parse(out).map(i => i.title))
}

function main() {
  const haveAlready = DRY ? new Set() : existing()
  let created = 0, skipped = 0
  for (const issue of ISSUES) {
    if (haveAlready.has(issue.title)) {
      console.log(`= skip   (exists): ${issue.title}`)
      skipped++
      continue
    }
    if (DRY) {
      console.log(`+ create (dry):    ${issue.title}`)
      continue
    }
    const r = spawnSync('gh', [
      'issue', 'create',
      '--title', issue.title,
      '--body',  issue.body,
      '--label', issue.labels.join(','),
    ], { encoding: 'utf8' })
    if (r.status === 0) {
      const url = (r.stdout ?? '').trim().split('\n').pop()
      console.log(`+ ${url}  ${issue.title}`)
      created++
    } else {
      console.error(`✗ failed: ${issue.title}\n  ${(r.stderr ?? '').trim()}`)
    }
  }
  console.log(`\nDone — created ${created}, skipped ${skipped}, total in script ${ISSUES.length}`)
}

main()
