// MIT License — personal-ai
// CLI slash-command handlers. Kept separate from the readline/chat loop in
// cli.ts — these are plain async functions over the app's managers.

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import chalk from 'chalk'
import type { AssistantEngine } from '../core/assistant.js'
import type { LLMProvider } from '../providers/interface.js'
import type { LongTermMemory } from '../memory/long-term.js'
import type { ProfileManager } from '../persona/profiles.js'
import type { ToolRegistry } from '../tools/registry.js'
import type { ModelManager } from '../core/model-manager.js'
import type { PluginManager } from '../plugins/manager.js'
import type { McpManager } from '../mcp/loader.js'
import type { ConversationContext } from '../core/context.js'
import { logger } from '../core/logger.js'
import { PROVIDER_META, inferProvider } from '../providers/metadata.js'
import { patchEnvFile } from './cli-helpers.js'

export const HELP = `
  ${chalk.bold('Commands')}
  ${chalk.cyan('/exit')}                  Quit
  ${chalk.cyan('/clear')}                 Clear conversation history
  ${chalk.cyan('/models')}                List available models
  ${chalk.cyan('/health')}                Check provider health
  ${chalk.cyan('/logs')}                  Show log file path
  ${chalk.cyan('/model')}                 Show current model routing
  ${chalk.cyan('/model')} <name>          Pin to a specific model
  ${chalk.cyan('/model auto')}            Resume auto task-based routing
  ${chalk.cyan('/switch')}                Show provider-switch instructions
  ${chalk.cyan('/switch')} <provider>     Show env vars for a provider switch
  ${chalk.cyan('/memory')}                Memory overview by category
  ${chalk.cyan('/memory list')}           List recent memories
  ${chalk.cyan('/memory search')} <q>     Search memories (keyword)
  ${chalk.cyan('/memory semantic')} <q>   Semantic similarity search
  ${chalk.cyan('/memory rebuild-index')}  Re-embed all memories
  ${chalk.cyan('/memory stats')}          Stats incl. vector index
  ${chalk.cyan('/memory save')} <t> <c>   Save memory (type: fact|preference|context|episodic)
  ${chalk.cyan('/profile')}               Show active profile
  ${chalk.cyan('/profile list')}          List all profiles
  ${chalk.cyan('/profile')} <name>        Switch profile
  ${chalk.cyan('/coder')}                 Switch to coder profile
  ${chalk.cyan('/research')}              Switch to researcher profile
  ${chalk.cyan('/tutor')}                 Switch to tutor profile
  ${chalk.cyan('/tools')}                 List registered tools
  ${chalk.cyan('/plugins')}               List plugins and status
  ${chalk.cyan('/plugins reload')} [name] Reload plugins from disk
  ${chalk.cyan('/plugins enable')} <name> Enable a plugin (persists)
  ${chalk.cyan('/plugins disable')} <name> Disable a plugin (persists)
  ${chalk.cyan('/mcp')}                   List MCP servers and their tools
  ${chalk.cyan('/save')} [name]           Save conversation to a named session
  ${chalk.cyan('/load')} [name]           Restore a saved session (no name = list)
  ${chalk.cyan('/cost')}                  Show session token usage and estimated cost
  ${chalk.cyan('/web')}                   Start web UI server (default port 3000)
  ${chalk.cyan('/help')}                  Show this message
`

const TYPE_LABELS: Record<string, string> = {
  personal: 'Personal', education: 'Education', career: 'Career',
  project: 'Projects', preference: 'Preferences', fact: 'Facts',
  context: 'Context', episodic: 'Episodic',
}

export async function handleMemoryCmd(parts: string[], memory: LongTermMemory): Promise<void> {
  const sub = parts[1]?.toLowerCase()
  if (!sub) {
    const s = memory.getStats()
    if (s.total === 0) { console.log(chalk.dim('No memories yet. Say "remember …" to save one.')); return }
    console.log(chalk.bold(`\nMemory (${s.total} stored, avg importance ${s.avgImportance}):`))
    for (const [type, label] of Object.entries(TYPE_LABELS)) {
      const items = memory.getByType(type as import('../memory/types.js').MemoryType, 5)
      if (!items.length) continue
      console.log(chalk.cyan(`\n  ${label}:`))
      for (const m of items) {
        console.log(`    • ${m.content.slice(0, 90)}${m.content.length > 90 ? '…' : ''}`)
      }
    }
    console.log(chalk.dim('\n  More: /memory list · /memory search <q> · /memory stats\n'))
    return
  }
  if (sub === 'stats') {
    const s = memory.getStats()
    const idx = memory.getIndexStats()
    console.log(chalk.bold('\nMemory stats:'))
    console.log(`  Total: ${s.total}   Avg importance: ${s.avgImportance}`)
    for (const [type, n] of Object.entries(s.byType)) {
      if (n > 0) console.log(`  ${type.padEnd(12)} ${n}`)
    }
    if (s.mostAccessed) console.log(`  Most accessed: "${s.mostAccessed.content.slice(0, 60)}"`)
    console.log(idx.embedder
      ? `  Semantic index: ${idx.indexed}/${s.total} embedded (${idx.embedder})`
      : chalk.dim('  Semantic index: off — pull nomic-embed-text and run /memory rebuild-index'))
    console.log()
    return
  }
  if (sub === 'semantic') {
    const query = parts.slice(2).join(' ')
    if (!query) { console.log(chalk.yellow('Usage: /memory semantic <query>')); return }
    const results = await memory.searchSemantic(query, 10)
    if (!results.length) { console.log(chalk.dim('No matches.')); return }
    console.log(chalk.bold(`\nSemantic matches for "${query}":`))
    for (const m of results) {
      console.log(`  ${chalk.cyan(`[${m.type}]`)} ${m.content.slice(0, 90)}`)
    }
    console.log()
    return
  }
  if (sub === 'rebuild-index') {
    process.stdout.write(chalk.dim('  Rebuilding vector index… '))
    const n = await memory.rebuildIndex()
    console.log(n > 0
      ? chalk.green(`✓ ${n} memories embedded`)
      : chalk.yellow('0 embedded — is Ollama running with nomic-embed-text pulled? (ollama pull nomic-embed-text)'))
    return
  }
  if (sub === 'list') {
    const recent = memory.getRecent(10)
    if (!recent.length) { console.log(chalk.dim('No memories yet.')); return }
    console.log(chalk.bold('\nRecent memories:'))
    for (const m of recent) {
      console.log(`  ${chalk.cyan(`[${m.type}]`)} ${chalk.dim(`imp:${m.importance}`)} ${m.content.slice(0, 80)}`)
    }
    console.log()
    return
  }
  if (sub === 'search') {
    const query = parts.slice(2).join(' ')
    if (!query) { console.log(chalk.yellow('Usage: /memory search <query>')); return }
    const results = memory.search(query, 10)
    if (!results.length) { console.log(chalk.dim(`No results for "${query}".`)); return }
    console.log(chalk.bold(`\nResults for "${query}":`))
    for (const m of results) {
      console.log(`  ${chalk.cyan(`[${m.type}]`)} ${chalk.dim(`imp:${m.importance} acc:${m.access_count}`)} ${m.content.slice(0, 80)}`)
    }
    console.log()
    return
  }
  if (sub === 'save') {
    const typeArg = parts[2]
    const content = parts.slice(3).join(' ')
    const valid   = ['fact', 'preference', 'context', 'episodic']
    if (!typeArg || !valid.includes(typeArg) || !content) {
      console.log(chalk.yellow('Usage: /memory save <fact|preference|context|episodic> <content>'))
      return
    }
    const saved = memory.save({ content, type: typeArg as 'fact', importance: 7 })
    console.log(chalk.green(`✓ Saved [${saved.type}]: ${saved.content.slice(0, 60)}`))
    return
  }
  console.log(chalk.yellow(`Unknown: /memory ${sub}. Try /help.`))
}

export function handleProfileCmd(parts: string[], profileManager: ProfileManager): void {
  const sub = parts[1]?.toLowerCase()
  if (!sub) {
    const p = profileManager.getActive()
    console.log(`Active: ${chalk.bold(p.name)} — ${p.description}`)
    return
  }
  if (sub === 'list') {
    const all = profileManager.getAll()
    console.log(chalk.bold('\nProfiles:'))
    for (const [key, p] of Object.entries(all)) {
      const active = key === profileManager.getActiveName() ? chalk.green(' ◀') : ''
      console.log(`  ${chalk.cyan(key)}${active} — ${p.description}`)
    }
    console.log()
    return
  }
  switchProfile(sub, profileManager)
}

/** Derive /switch env-var instructions from the central provider table. */
function switchHelpFor(key: string): string[] | undefined {
  const meta = PROVIDER_META[key as keyof typeof PROVIDER_META]
  if (!meta) return undefined
  const lines = [`PROVIDER=${meta.key}`]
  if (meta.key === 'ollama')   lines.push('OLLAMA_BASE_URL=http://localhost:11434')
  if (meta.key === 'lmstudio') lines.push('LMSTUDIO_BASE_URL=http://localhost:1234/v1')
  if (meta.envKey) lines.push(`${meta.envKey}=...`)
  lines.push(`${meta.modelEnvKey}=${meta.defaultModel}`)
  return lines
}

export function handleSwitchCmd(parts: string[]): void {
  const provider = parts[1]?.toLowerCase()
  const names = Object.keys(PROVIDER_META)

  if (!provider) {
    console.log(chalk.bold('\nProvider switching:'))
    console.log('  Edit .env, set PROVIDER, then restart PersonalAI.')
    console.log(`  Providers: ${names.map(n => chalk.cyan(n)).join(', ')}`)
    console.log(`  Example: ${chalk.cyan('/switch ollama')}\n`)
    return
  }

  const lines = switchHelpFor(provider)
  if (!lines) {
    console.log(chalk.yellow(`Unknown provider "${provider}". Valid: ${names.join(', ')}`))
    return
  }

  console.log(chalk.bold(`\nSwitch to ${provider}:`))
  for (const line of lines) console.log(`  ${line}`)
  console.log(chalk.dim('  Restart PersonalAI after editing .env.\n'))
}

export function switchProfile(name: string, profileManager: ProfileManager): void {
  try {
    profileManager.setActive(name)
    const p = profileManager.getActive()
    console.log(chalk.green(`✓ Switched to ${p.name} — ${p.description}`))
  } catch (e) {
    console.log(chalk.red(String(e)))
  }
}

export async function handleModelCmd(
  parts:          string[],
  modelManager:   ModelManager,
  engine:         AssistantEngine,
  providerName:   string,
  envPath:        string,
  reloadProvider: () => Promise<LLMProvider>,
): Promise<LLMProvider | undefined> {
  const sub = parts[1]?.toLowerCase()
  if (!sub) {
    const stats = modelManager.getStats()
    console.log(chalk.bold('\nModel routing:'))
    console.log(`  Current: ${chalk.cyan(stats.current)}  (mode: ${stats.mode})`)
    console.log(`  Default: ${stats.config.default}`)
    const tasks = stats.config.tasks
    for (const [task, model] of Object.entries(tasks)) {
      if (model) console.log(`  ${task.padEnd(12)} → ${model}`)
    }
    console.log()
    return
  }
  if (sub === 'auto') {
    modelManager.setAuto()
    console.log(chalk.green('✓ Auto task-based routing enabled'))
    return
  }

  const modelName = parts.slice(1).join(' ')
  const targetProvider = inferProvider(modelName)

  // Provider switch needed
  if (targetProvider && targetProvider !== providerName) {
    const modelKey = PROVIDER_META[targetProvider]?.modelEnvKey
    const isBareProvider = modelName.toLowerCase() === targetProvider
    // When user types bare provider name (e.g. /model ollama), keep existing model env var
    const actualModel = isBareProvider
      ? (modelKey ? (process.env[modelKey] ?? modelName) : modelName)
      : modelName

    const changes: Record<string, string> = { PROVIDER: targetProvider }
    if (modelKey && !isBareProvider) changes[modelKey] = modelName
    patchEnvFile(envPath, changes)
    process.env['PROVIDER'] = targetProvider
    if (modelKey && !isBareProvider) process.env[modelKey] = modelName

    process.stdout.write(chalk.dim(`  Switching provider ${providerName} → ${targetProvider}…`))
    try {
      const newProvider = await reloadProvider()
      engine.setProvider(newProvider)
      modelManager.setModel(actualModel)
      console.log(chalk.green(` ✓\n✓ Pinned to ${actualModel} (${targetProvider})`))
      console.log(chalk.dim(`  .env updated: PROVIDER=${targetProvider}`))
      return newProvider
    } catch (err) {
      console.log(chalk.red(` ✗\nFailed to switch: ${String(err)}`))
      return
    }
  }

  modelManager.setModel(modelName)
  console.log(chalk.green(`✓ Pinned to ${modelManager.getCurrentModel()}`))
  return
}

export async function handlePluginsCmd(parts: string[], plugins: PluginManager): Promise<void> {
  const sub = parts[1]?.toLowerCase()

  if (!sub || sub === 'list' || sub === 'health') {
    const rows = plugins.health()
    if (rows.length === 0) {
      console.log(chalk.dim('No plugins installed. Drop one into plugins/ or ~/.personal-ai/plugins/.'))
      return
    }
    const nameW = Math.max(16, ...rows.map(r => r.name.length + 2))
    console.log(chalk.bold(`\n${'Plugin'.padEnd(nameW)}Status`))
    console.log(chalk.dim('-'.repeat(nameW + 24)))
    for (const r of rows) {
      const color = r.status.startsWith('healthy') ? chalk.green : r.status === 'disabled' ? chalk.dim : chalk.red
      console.log(`${r.name.padEnd(nameW)}${color(r.status)}${sub === 'health' ? chalk.dim(`  v${r.version}  tools:${r.tools} hooks:${r.hooks}${r.error ? `  ${r.error}` : ''}`) : ''}`)
    }
    console.log()
    return
  }

  if (sub === 'reload') {
    const name = parts[2]
    if (name) {
      const r = await plugins.reload(name)
      console.log(r ? chalk.green(`✓ Reloaded ${name} (${r.status})`) : chalk.yellow(`Plugin "${name}" not found`))
    } else {
      for (const p of plugins.list()) await plugins.reload(p.manifest.name)
      console.log(chalk.green(`✓ Reloaded ${plugins.list().length} plugin(s)`))
    }
    return
  }

  if (sub === 'enable' || sub === 'disable') {
    const name = parts[2]
    if (!name) { console.log(chalk.yellow(`Usage: /plugins ${sub} <name>`)); return }
    const r = await plugins.setEnabled(name, sub === 'enable')
    console.log(r
      ? chalk.green(`✓ ${name} ${sub}d (${r.status})`)
      : chalk.yellow(`Plugin "${name}" not found`))
    return
  }

  console.log(chalk.yellow('Usage: /plugins [list|health|reload [name]|enable <name>|disable <name>]'))
}

export function handleMcpCmd(mcp: McpManager, registry?: ToolRegistry): void {
  const servers = mcp.list()
  if (servers.length === 0) {
    console.log(chalk.dim('No MCP servers configured.'))
    console.log(chalk.dim('  Create config/mcp.json or ~/.personal-ai/mcp.json:'))
    console.log(chalk.dim('  { "servers": { "name": { "command": "npx", "args": ["-y", "@some/mcp-server"] } } }'))
    return
  }
  console.log(chalk.bold('\nMCP servers:'))
  for (const s of servers) {
    const color = s.status === 'connected' ? chalk.green : chalk.red
    console.log(`  ${s.name.padEnd(20)} ${color(s.status)}  ${s.status === 'connected' ? `${s.tools} tools` : s.error ?? ''}`)
  }
  if (registry) {
    const mcpTools = registry.getAll().filter(t => t.definition.name.startsWith('mcp_'))
    if (mcpTools.length) {
      console.log(chalk.bold('\nMCP tools:'))
      for (const t of mcpTools) {
        console.log(`  ${chalk.cyan(t.definition.name)} — ${t.definition.description.slice(0, 80)}`)
      }
    }
  }
  console.log()
}

const SESSIONS_DIR = path.join(os.homedir(), '.personal-ai', 'sessions')

function sessionPath(name: string): string {
  const safe = name.replace(/[^\w-]/g, '_')
  return path.join(SESSIONS_DIR, `${safe}.json`)
}

export function handleSaveCmd(parts: string[], context: ConversationContext): void {
  if (context.messageCount === 0) { console.log(chalk.yellow('Nothing to save yet.')); return }
  const name = parts[1] ?? `session-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}`
  try {
    fs.mkdirSync(SESSIONS_DIR, { recursive: true })
    fs.writeFileSync(sessionPath(name), JSON.stringify({
      messages: context.getMessages(),
      savedAt:  new Date().toISOString(),
    }, null, 2))
    console.log(chalk.green(`✓ Saved ${context.messageCount} messages as "${name}"`))
    console.log(chalk.dim(`  Restore with: /load ${name}`))
  } catch (e) {
    console.log(chalk.red(`Save failed: ${String(e)}`))
  }
}

export function handleLoadCmd(parts: string[], context: ConversationContext): void {
  const name = parts[1]
  if (!name) {
    // List available sessions
    try {
      const files = fs.readdirSync(SESSIONS_DIR).filter(f => f.endsWith('.json'))
      if (!files.length) { console.log(chalk.dim('No saved sessions. Save with /save [name].')); return }
      console.log(chalk.bold('\nSaved sessions:'))
      for (const f of files) console.log(`  ${chalk.cyan(f.replace(/\.json$/, ''))}`)
      console.log(chalk.dim('\n  Load with: /load <name>\n'))
    } catch { console.log(chalk.dim('No saved sessions.')) }
    return
  }
  try {
    const raw = JSON.parse(fs.readFileSync(sessionPath(name), 'utf8')) as { messages?: unknown }
    if (!Array.isArray(raw.messages)) { console.log(chalk.red('Invalid session file.')); return }
    context.restore(raw.messages as import('../providers/interface.js').Message[])
    console.log(chalk.green(`✓ Restored "${name}" (${context.messageCount} messages)`))
  } catch {
    console.log(chalk.red(`Session "${name}" not found. Run /load to list.`))
  }
}

export async function handleCommand(
  parts: string[],
  provider: LLMProvider,
  context: ConversationContext,
  memory: LongTermMemory | undefined,
  profileManager: ProfileManager | undefined,
  registry?: ToolRegistry,
  modelManager?: ModelManager,
  startWeb?: () => Promise<string>,
  getCost?: () => string,
  plugins?: PluginManager,
  mcp?: McpManager,
): Promise<void> {
  const cmd = parts[0]?.toLowerCase()
  switch (cmd) {
    case '/plugins':
      if (!plugins) { console.log(chalk.yellow('Plugins not available.')); break }
      await handlePluginsCmd(parts, plugins)
      break
    case '/mcp':
      if (!mcp) { console.log(chalk.yellow('MCP not available.')); break }
      handleMcpCmd(mcp, registry)
      break
    case '/exit':
      console.log(chalk.dim('Goodbye.'))
      process.exit(0)
      break
    case '/clear':
      context.clear()
      console.log(chalk.dim('Conversation cleared.'))
      break
    case '/models':
      if (provider.listModels) {
        const models = await provider.listModels()
        console.log(chalk.bold('\nAvailable models:'))
        for (const m of models) {
          console.log(`  ${m.name}${m.supportsTools ? chalk.green(' [tools]') : ''}`)
        }
        console.log()
      } else {
        console.log(chalk.dim(`Current model: ${provider.model}`))
      }
      break
    case '/switch':
      handleSwitchCmd(parts)
      break
    case '/health':
      if (provider.healthCheck) {
        const h = await provider.healthCheck()
        console.log(h.ok
          ? chalk.green(`✓ OK — ${h.model} (${h.latencyMs}ms)`)
          : chalk.red(`✗ ${h.error ?? 'unhealthy'}`))
      }
      break
    case '/cost':
      console.log(getCost ? getCost() : chalk.yellow('No session data yet.'))
      break
    case '/logs': {
      const logPath = logger.getLogPath()
      console.log(chalk.dim(logPath))
      try {
        const lines = fs.readFileSync(logPath, 'utf8').split('\n').filter(Boolean)
        const errors = lines.filter(l => /error/i.test(l)).slice(-5)
        if (errors.length) {
          console.log(chalk.dim('\nRecent errors:'))
          for (const l of errors) console.log(chalk.red(`  ${l.slice(0, 120)}`))
        }
      } catch { /* log file may not exist yet */ }
      console.log()
      break
    }
    case '/memory':
      if (!memory) { console.log(chalk.yellow('Memory not enabled.')); break }
      await handleMemoryCmd(parts, memory)
      break
    case '/profile':
      if (!profileManager) { console.log(chalk.yellow('Profiles not loaded.')); break }
      handleProfileCmd(parts, profileManager)
      break
    case '/coder':    if (profileManager) switchProfile('coder', profileManager);      break
    case '/research': if (profileManager) switchProfile('researcher', profileManager); break
    case '/tutor':    if (profileManager) switchProfile('tutor', profileManager);      break
    case '/tools':
      if (!registry || registry.count() === 0) { console.log(chalk.dim('No tools registered.')); break }
      console.log(chalk.bold(`\nRegistered tools (${registry.count()}):`))
      for (const t of registry.getAll()) {
        console.log(`  ${chalk.cyan(t.definition.name)} — ${t.definition.description}`)
      }
      console.log()
      break
    case '/web':
      if (!startWeb) { console.log(chalk.yellow('Web UI not configured.')); break }
      try {
        const url = await startWeb()
        console.log(chalk.green(`✓ Web UI running at ${chalk.bold(url)}`))
        console.log(chalk.dim(`  Open in browser: ${url}`))
      } catch (e) {
        console.log(chalk.red(`Failed to start web: ${String(e)}`))
      }
      break
    case '/save':
      handleSaveCmd(parts, context)
      break
    case '/load':
    case '/sessions':
      handleLoadCmd(parts, context)
      break
    case '/help':
      console.log(HELP)
      break
    default:
      console.log(chalk.yellow(`Unknown command: ${cmd}. Type /help.`))
  }
}
