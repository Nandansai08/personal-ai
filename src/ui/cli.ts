// MIT License — personal-ai
import readline from 'node:readline'
import chalk from 'chalk'
import type { AssistantEngine } from '../core/assistant.js'
import type { LLMProvider } from '../providers/interface.js'
import type { LongTermMemory } from '../memory/long-term.js'
import type { ProfileManager } from '../persona/profiles.js'
import type { ToolRegistry } from '../tools/registry.js'
import { logger } from '../core/logger.js'
import { ConversationContext } from '../core/context.js'

const BANNER = `
${chalk.cyan('╔═══════════════════════════════════════╗')}
${chalk.cyan('║')}  ${chalk.bold('PersonalAI')} ${chalk.dim('v0.3.0')}                   ${chalk.cyan('║')}
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
  ${chalk.cyan('/memory')}                Memory stats
  ${chalk.cyan('/memory list')}           List recent memories
  ${chalk.cyan('/memory search')} <q>     Search memories
  ${chalk.cyan('/memory save')} <t> <c>   Save memory (type: fact|preference|context|episodic)
  ${chalk.cyan('/profile')}               Show active profile
  ${chalk.cyan('/profile list')}          List all profiles
  ${chalk.cyan('/profile')} <name>        Switch profile
  ${chalk.cyan('/coder')}                 Switch to coder profile
  ${chalk.cyan('/research')}              Switch to researcher profile
  ${chalk.cyan('/tutor')}                 Switch to tutor profile
  ${chalk.cyan('/tools')}                 List registered tools
  ${chalk.cyan('/help')}                  Show this message
`

function makePrompt(provider: LLMProvider, profileManager?: ProfileManager): string {
  const model   = provider.model
  const profile = profileManager?.getActiveName()
  const label   = profile && profile !== 'assistant' ? `${model}|${profile}` : model
  return chalk.cyan(`[${label}] `) + chalk.bold('> ')
}

async function handleMemoryCmd(parts: string[], memory: LongTermMemory): Promise<void> {
  const sub = parts[1]?.toLowerCase()
  if (!sub) {
    const s = memory.getStats()
    console.log(chalk.bold('\nMemory stats:'))
    console.log(`  Total:    ${s.total}`)
    console.log(`  Facts:    ${s.byType.fact}`)
    console.log(`  Prefs:    ${s.byType.preference}`)
    console.log(`  Context:  ${s.byType.context}`)
    console.log(`  Episodic: ${s.byType.episodic}`)
    console.log(`  Avg importance: ${s.avgImportance}`)
    if (s.mostAccessed) console.log(`  Most accessed: "${s.mostAccessed.content.slice(0, 60)}"`)
    console.log()
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

function switchProfile(name: string, profileManager: ProfileManager): void {
  try {
    profileManager.setActive(name)
    const p = profileManager.getActive()
    console.log(chalk.green(`✓ Switched to ${p.name} — ${p.description}`))
  } catch (e) {
    console.log(chalk.red(String(e)))
  }
}

async function handleCommand(
  parts: string[],
  provider: LLMProvider,
  context: ConversationContext,
  memory: LongTermMemory | undefined,
  profileManager: ProfileManager | undefined,
  registry?: ToolRegistry,
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
    case '/health':
      if (provider.healthCheck) {
        const h = await provider.healthCheck()
        console.log(h.ok
          ? chalk.green(`✓ OK — ${h.model} (${h.latencyMs}ms)`)
          : chalk.red(`✗ ${h.error ?? 'unhealthy'}`))
      }
      break
    case '/logs':
      console.log(chalk.dim(logger.getLogPath()))
      break
    case '/memory':
      if (!memory) { console.log(chalk.yellow('Memory not enabled.')); break }
      await handleMemoryCmd(parts, memory)
      break
    case '/profile':
      if (!profileManager) { console.log(chalk.yellow('Profiles not loaded.')); break }
      handleProfileCmd(parts, profileManager)
      break
    case '/coder':    profileManager && switchProfile('coder', profileManager);      break
    case '/research': profileManager && switchProfile('researcher', profileManager); break
    case '/tutor':    profileManager && switchProfile('tutor', profileManager);      break
    case '/tools':
      if (!registry || registry.count() === 0) { console.log(chalk.dim('No tools registered.')); break }
      console.log(chalk.bold(`\nRegistered tools (${registry.count()}):`))
      for (const t of registry.getAll()) {
        console.log(`  ${chalk.cyan(t.definition.name)} — ${t.definition.description}`)
      }
      console.log()
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
): Promise<void> {
  console.log(BANNER)

  if (provider.healthCheck) {
    process.stdout.write(chalk.dim('Connecting to provider…'))
    const health = await provider.healthCheck()
    if (health.ok) {
      console.log(`\r${chalk.green('✓')} ${provider.name} / ${chalk.bold(health.model)} ${chalk.dim(`(${health.latencyMs}ms)`)}\n`)
    } else {
      console.log(`\r${chalk.red('✗')} ${provider.name} unreachable: ${health.error ?? 'unknown'}`)
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

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  const refreshPrompt = () => {
    rl.setPrompt(makePrompt(provider, profileManager))
    rl.prompt()
  }
  refreshPrompt()

  let busy = false

  rl.on('line', async (line) => {
    if (busy) return

    const input = line.trim()
    if (!input) { refreshPrompt(); return }

    if (input.startsWith('/')) {
      await handleCommand(input.split(' '), provider, context, memory, profileManager, registry)
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
      for await (const chunk of engine.chat(input)) {
        if (chunk.type === 'text') {
          clearSpinner()
          process.stdout.write(chunk.delta)
        } else if (chunk.type === 'tool_call') {
          clearSpinner()
          process.stdout.write(chalk.cyan(`\n  ⟳ ${chunk.name}…`))
        } else if (chunk.type === 'tool_result') {
          process.stdout.write(chalk.green(' ✓\n'))
        } else if (chunk.type === 'error') {
          clearSpinner()
          console.error(chalk.red(`\nError: ${chunk.message}`))
        } else if (chunk.type === 'done' && chunk.usage) {
          clearSpinner()
          console.log(chalk.dim(`\n  [${chunk.usage.input}in / ${chunk.usage.output}out tokens]`))
        }
      }
      clearSpinner()
    } catch (err) {
      clearSpinner()
      logger.error('cli', 'chat error', err)
      console.error(chalk.red('\nChat failed — check /logs for details.'))
    }
    console.log()
    busy = false
    rl.resume()
    refreshPrompt()
  })

  rl.on('close', () => { console.log(chalk.dim('\nSession ended.')) })
}
