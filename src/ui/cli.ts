// MIT License — personal-ai
import readline from 'node:readline'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'
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
import type { PluginManager } from '../plugins/manager.js'
import type { McpManager } from '../mcp/loader.js'

import { inferProvider } from '../providers/metadata.js'
import { makeToolXmlStripper, patchEnvFile, friendlyError, createStreamRenderer } from './cli-helpers.js'
import { handleCommand, handleModelCmd } from './commands.js'

// Re-export for tests and external callers
export { inferProvider, makeToolXmlStripper, patchEnvFile, friendlyError, createStreamRenderer }

function readVersion(): string {
  try {
    const here = path.dirname(fileURLToPath(import.meta.url))
    const pkg = JSON.parse(fs.readFileSync(path.join(here, '..', '..', 'package.json'), 'utf8')) as { version?: string }
    return pkg.version ?? ''
  } catch { return '' }
}

const TIPS = [
  'Say "remember …" to teach the assistant a fact about you.',
  'Type /model gpt-4o-mini to hot-swap providers — .env updates automatically.',
  '/web starts the browser UI on http://localhost:3000.',
  'Drop a folder into plugins/ to add a custom tool — see docs/PLUGINS.md.',
  'Connect MCP servers via config/mcp.json — see docs/MCP.md.',
  '/memory semantic <query> searches by meaning, not just keywords.',
  '/save names this conversation; /load brings it back later.',
  '/profile coder swaps the system prompt for development tasks.',
  'Shift+Enter starts a new line; Enter sends the message.',
]

const SPARK = '✻'

const banner = (): string => {
  const accent = chalk.hex('#8b5cf6') // brand violet
  const version = readVersion()
  return [
    '',
    `  ${accent.bold(SPARK)} ${chalk.bold('Welcome to PersonalAI')} ${chalk.dim(`v${version}`)}`,
    '',
  ].join('\n')
}

function makePrompt(provider: LLMProvider, profileManager?: ProfileManager, modelManager?: ModelManager): string {
  const accent = chalk.hex('#8b5cf6')
  const model   = modelManager ? modelManager.getCurrentModel() : provider.model
  const profile = profileManager?.getActiveName()
  const label   = profile && profile !== 'assistant' ? `${model} · ${profile}` : model
  return accent(`${SPARK} `) + chalk.dim(`${label} `) + chalk.bold.hex('#8b5cf6')('› ')
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
  plugins?: PluginManager,
  mcp?: McpManager,
): Promise<void> {
  let activeProvider = provider

  process.stdout.write(banner())

  // Provider health line — single line, no double newlines
  let healthLine = ''
  if (activeProvider.healthCheck) {
    process.stdout.write(chalk.dim('  Connecting…'))
    const health = await activeProvider.healthCheck()
    if (health.ok) {
      healthLine = `${chalk.green('●')} ${activeProvider.name} ${chalk.dim('·')} ${chalk.bold(health.model)} ${chalk.dim(`(${health.latencyMs}ms)`)}`
    } else {
      healthLine = `${chalk.red('●')} ${activeProvider.name} unreachable ${chalk.dim('— ' + (health.error ?? 'unknown'))}`
    }
    process.stdout.write('\r  ' + healthLine + '   \n')
  }

  // Condensed status: memory · tools · plugins · MCP · profile — one line each, dim
  const statusLines: string[] = []
  if (memory) {
    const stats = memory.getStats()
    const idx = memory.getIndexStats()
    const ix = idx.embedder ? `${idx.indexed}/${stats.total} embedded` : 'keyword'
    statusLines.push(`${chalk.dim('memory')}  ${stats.total} stored ${chalk.dim('·')} ${ix}`)
  }
  if (registry && registry.count() > 0) {
    const mcp = registry.getAll().filter(t => t.definition.name.startsWith('mcp_')).length
    statusLines.push(`${chalk.dim('tools')}   ${registry.count()} registered${mcp ? ` ${chalk.dim('·')} ${mcp} via MCP` : ''}`)
  }
  if (plugins && plugins.list().length > 0) {
    const healthy = plugins.list().filter(p => p.status === 'healthy').length
    const total = plugins.list().length
    statusLines.push(`${chalk.dim('plugins')} ${healthy}/${total} active`)
  }
  if (profileManager) {
    const p = profileManager.getActive()
    statusLines.push(`${chalk.dim('profile')} ${p.name} ${chalk.dim('— ' + p.description)}`)
  }
  for (const line of statusLines) console.log('  ' + line)

  // One rotating tip (Claude Code aesthetic — short, helpful, dim)
  const tip = TIPS[Math.floor(Math.random() * TIPS.length)]!
  console.log('')
  console.log('  ' + chalk.dim('Tip: ') + chalk.dim(tip))
  console.log('  ' + chalk.dim('Type ') + chalk.hex('#8b5cf6')('/help') + chalk.dim(' for all commands, ') + chalk.hex('#8b5cf6')('/exit') + chalk.dim(' to quit.'))
  console.log('')

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
      await handleCommand(input.split(' '), activeProvider, context, memory, profileManager, registry, modelManager, startWeb, getCost, plugins, mcp)
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
