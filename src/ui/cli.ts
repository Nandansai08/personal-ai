// MIT License — personal-ai
import readline from 'node:readline'
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
import { logger } from '../core/logger.js'
import { eventBus } from '../core/events.js'
import { ConversationContext } from '../core/context.js'

import { PROVIDER_META, inferProvider } from '../providers/metadata.js'
import { makeToolXmlStripper, patchEnvFile, friendlyError, createStreamRenderer } from './cli-helpers.js'

// Re-export for tests and external callers
export { inferProvider, makeToolXmlStripper, patchEnvFile, friendlyError, createStreamRenderer }

function modelEnvKeyFor(provider: string): string | undefined {
  return PROVIDER_META[provider as keyof typeof PROVIDER_META]?.modelEnvKey
}

const BANNER = `
${chalk.cyan('╔═══════════════════════════════════════╗')}
${chalk.cyan('║')}  ${chalk.bold('PersonalAI')} ${chalk.dim('v0.7.0')}                   ${chalk.cyan('║')}
${chalk.cyan('║')}  ${chalk.dim('Local-first. Any model.')}              ${chalk.cyan('║')}
${chalk.cyan('╚═══════════════════════════════════════╝')}
`

const HELP = `
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
  ${chalk.cyan('/memory')}                Memory stats
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
  ${chalk.cyan('/save')} [name]           Save conversation to a named session
  ${chalk.cyan('/load')} [name]           Restore a saved session (no name = list)
  ${chalk.cyan('/cost')}                  Show session token usage and estimated cost
  ${chalk.cyan('/web')}                   Start web UI server (default port 3000)
  ${chalk.cyan('/help')}                  Show this message
`

function makePrompt(provider: LLMProvider, profileManager?: ProfileManager, modelManager?: ModelManager): string {
  const model   = modelManager ? modelManager.getCurrentModel() : provider.model
  const profile = profileManager?.getActiveName()
  const label   = profile && profile !== 'assistant' ? `${model}|${profile}` : model
  return chalk.cyan(`[${label}] `) + chalk.bold('> ')
}

const TYPE_LABELS: Record<string, string> = {
  personal: 'Personal', education: 'Education', career: 'Career',
  project: 'Projects', preference: 'Preferences', fact: 'Facts',
  context: 'Context', episodic: 'Episodic',
}

async function handleMemoryCmd(parts: string[], memory: LongTermMemory): Promise<void> {
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

function handleProfileCmd(parts: string[], profileManager: ProfileManager): void {
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

function handleSwitchCmd(parts: string[]): void {
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

function switchProfile(name: string, profileManager: ProfileManager): void {
  try {
    profileManager.setActive(name)
    const p = profileManager.getActive()
    console.log(chalk.green(`✓ Switched to ${p.name} — ${p.description}`))
  } catch (e) {
    console.log(chalk.red(String(e)))
  }
}

async function handleModelCmd(
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
    const modelKey = modelEnvKeyFor(targetProvider)
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

const SESSIONS_DIR = path.join(os.homedir(), '.personal-ai', 'sessions')

function sessionPath(name: string): string {
  const safe = name.replace(/[^\w-]/g, '_')
  return path.join(SESSIONS_DIR, `${safe}.json`)
}

function handleSaveCmd(parts: string[], context: ConversationContext): void {
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

function handleLoadCmd(parts: string[], context: ConversationContext): void {
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

async function handleCommand(
  parts: string[],
  provider: LLMProvider,
  context: ConversationContext,
  memory: LongTermMemory | undefined,
  profileManager: ProfileManager | undefined,
  registry?: ToolRegistry,
  modelManager?: ModelManager,
  startWeb?: () => Promise<string>,
  getCost?: () => string,
): Promise<void> {
  const cmd = parts[0]?.toLowerCase()
  switch (cmd) {
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

export async function startCLI(
  provider: LLMProvider,
  engine: AssistantEngine,
  context: ConversationContext,
  memory?: LongTermMemory,
  profileManager?: ProfileManager,
  registry?: ToolRegistry,
  modelManager?: ModelManager,
  startWeb?: () => Promise<string>,
  reloadProvider?: () => Promise<LLMProvider>,
  envPath?: string,
): Promise<void> {
  let activeProvider = provider

  console.log(BANNER)

  if (activeProvider.healthCheck) {
    process.stdout.write(chalk.dim('Connecting to provider…'))
    const health = await activeProvider.healthCheck()
    if (health.ok) {
      console.log(`\r${chalk.green('✓')} ${activeProvider.name} / ${chalk.bold(health.model)} ${chalk.dim(`(${health.latencyMs}ms)`)}\n`)
    } else {
      console.log(`\r${chalk.red('✗')} ${activeProvider.name} unreachable: ${health.error ?? 'unknown'}`)
      console.log(chalk.yellow('  Start Ollama or set PROVIDER env var.\n'))
    }
  }

  if (memory) {
    const stats = memory.getStats()
    console.log(chalk.dim(`  Memory: ${stats.total} stored`))
  }
  if (registry && registry.count() > 0) {
    console.log(chalk.dim(`  Tools: ${registry.count()} registered`))
  }
  if (profileManager) {
    const p = profileManager.getActive()
    console.log(chalk.dim(`  Profile: ${p.name} — ${p.description}\n`))
  }

  // ── session token tracking ──────────────────────────────────────────
  const sessTokens = { input: 0, output: 0 }
  const PRICE: Record<string, [number, number]> = {
    anthropic: [3, 15],
    openai:    [5, 15],
    groq:      [0.59, 0.79],
  }

  const getCost = (): string => {
    const inK  = sessTokens.input
    const outK = sessTokens.output
    if (inK === 0 && outK === 0) return chalk.dim('No tokens used this session.')
    const prices = PRICE[activeProvider.name]
    if (!prices) {
      return chalk.cyan(`Session: ${inK.toLocaleString()} in / ${outK.toLocaleString()} out | `) + chalk.green('FREE (local)')
    }
    const est = (inK / 1_000_000) * prices[0] + (outK / 1_000_000) * prices[1]
    return chalk.cyan(`Session: ${inK.toLocaleString()} in / ${outK.toLocaleString()} out | `) +
           chalk.yellow(`Est. $${est.toFixed(4)}`)
  }

  const saveSession = (): void => {
    const sessDir = path.join(
      os.homedir(), '.personal-ai', 'sessions',
    )
    try {
      fs.mkdirSync(sessDir, { recursive: true })
      fs.writeFileSync(
        path.join(sessDir, `session-${Date.now()}.json`),
        JSON.stringify({ messages: context.getMessages(), savedAt: new Date().toISOString() }, null, 2),
      )
      // keep max 10 sessions
      const files = fs.readdirSync(sessDir)
        .filter(f => f.startsWith('session-'))
        .sort()
      for (const old of files.slice(0, Math.max(0, files.length - 10))) {
        fs.unlinkSync(path.join(sessDir, old))
      }
    } catch { /* non-critical */ }
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  const refreshPrompt = () => {
    rl.setPrompt(makePrompt(activeProvider, profileManager, modelManager))
    rl.prompt()
  }

  // Memory visibility: show a dim note whenever a memory is auto-saved.
  // Queued while a response is streaming — printing mid-stream splits output.
  const pendingNotices: string[] = []
  eventBus.on('memory_saved', ({ type, importance }) => {
    pendingNotices.push(chalk.dim(`  💾 memory saved (${type}, importance ${importance}) — review with /memory list`))
  })
  const flushNotices = (): void => {
    for (const n of pendingNotices.splice(0)) console.log(n)
  }

  // Security: dangerous tools (file_reader) need explicit per-call approval
  if (registry) {
    registry.setConfirmHandler(async (name, args) => {
      const argStr = JSON.stringify(args)
      const preview = argStr.length > 120 ? argStr.slice(0, 120) + '…' : argStr
      const answer = await new Promise<string>(resolve =>
        rl.question(chalk.yellow(`\n  ⚠ Allow ${name}(${preview})? [y/N] `), resolve),
      )
      return /^y(es)?$/i.test(answer.trim())
    })
  }

  refreshPrompt()

  let busy = false

  rl.on('line', async (line) => {
    if (busy) return

    const input = line.trim()
    if (!input) { refreshPrompt(); return }

    if (input === '/exit') {
      const memCount = memory ? memory.getStats().total : 0
      console.log(chalk.dim(`\nSession memories stored: ${memCount}`))
      console.log(getCost())
      saveSession()
      console.log(chalk.dim('\nGoodbye.'))
      rl.close()
      process.exit(0)
    }

    if (input.startsWith('/model') && modelManager && reloadProvider && envPath) {
      const newProvider = await handleModelCmd(
        input.split(' '), modelManager, engine,
        activeProvider.name, envPath, reloadProvider,
      )
      if (newProvider) activeProvider = newProvider
      refreshPrompt()
      return
    }

    if (input.startsWith('/')) {
      await handleCommand(input.split(' '), activeProvider, context, memory, profileManager, registry, modelManager, startWeb, getCost)
      refreshPrompt()
      return
    }

    busy = true
    rl.pause()

    // Spinner while waiting for first token
    const frames = ['⠋', '⠙', '⠸', '⠴', '⠦', '⠇']
    let frame = 0
    process.stdout.write(chalk.dim('\nAssistant: '))
    const spinner = setInterval(() => {
      process.stdout.write(`\r${chalk.dim('Assistant: ')}${chalk.dim(frames[frame++ % frames.length]!)}`)
    }, 100)

    let firstToken = true
    const clearSpinner = () => {
      if (firstToken) {
        clearInterval(spinner)
        process.stdout.write(`\r${chalk.dim('Assistant: ')}`)
        firstToken = false
      }
    }

    try {
      const renderer = createStreamRenderer(s => process.stdout.write(s))
      for await (const chunk of engine.chat(input)) {
        if (chunk.type !== 'done') clearSpinner()
        if (chunk.type === 'text') {
          renderer.text(chunk.delta)
        } else if (chunk.type === 'tool_call') {
          renderer.toolCall(chunk.name)
        } else if (chunk.type === 'tool_result') {
          renderer.toolResult()
        } else if (chunk.type === 'model_switch') {
          // No refreshPrompt() here — redrawing the prompt mid-stream
          // injects prompt text into the streamed response
          renderer.modelSwitch(chunk.from, chunk.to)
        } else if (chunk.type === 'error') {
          renderer.error(friendlyError(chunk.message, activeProvider.name))
        } else if (chunk.type === 'done' && chunk.usage) {
          clearSpinner()
          sessTokens.input  += chunk.usage.input
          sessTokens.output += chunk.usage.output
          renderer.usage(chunk.usage.input, chunk.usage.output)
        }
      }
      clearSpinner()
      renderer.finish()
    } catch (err) {
      clearSpinner()
      logger.error('cli', 'chat error', err)
      const msg = err instanceof Error ? err.message : String(err)
      console.error(chalk.red(`\n${friendlyError(msg, activeProvider.name)}`))
      console.error(chalk.dim('  Run /logs for details.'))
    }
    console.log()
    flushNotices()
    busy = false
    rl.resume()
    refreshPrompt()
  })

  rl.on('close', () => { console.log(chalk.dim('\nSession ended.')) })
}
