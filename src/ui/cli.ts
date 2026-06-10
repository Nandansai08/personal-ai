// MIT License — personal-ai
import readline from 'node:readline'
import chalk from 'chalk'
import type { AssistantEngine } from '../core/assistant.js'
import type { LLMProvider } from '../providers/interface.js'
import type { LongTermMemory } from '../memory/long-term.js'
import { logger } from '../core/logger.js'
import { ConversationContext } from '../core/context.js'

const BANNER = `
${chalk.cyan('╔═══════════════════════════════════════╗')}
${chalk.cyan('║')}  ${chalk.bold('PersonalAI')} ${chalk.dim('v0.2.0')}                   ${chalk.cyan('║')}
${chalk.cyan('║')}  ${chalk.dim('Local-first. Any model.')}              ${chalk.cyan('║')}
${chalk.cyan('╚═══════════════════════════════════════╝')}
`

const HELP = `
  ${chalk.bold('Commands')}
  ${chalk.cyan('/exit')}              Quit
  ${chalk.cyan('/clear')}             Clear conversation history
  ${chalk.cyan('/models')}            List available models
  ${chalk.cyan('/health')}            Check provider health
  ${chalk.cyan('/logs')}              Show log file path
  ${chalk.cyan('/memory')}            Show memory stats
  ${chalk.cyan('/memory list')}       List recent memories
  ${chalk.cyan('/memory search')} <q> Search memories
  ${chalk.cyan('/memory save')}  <t>  Save memory (type: fact|preference|context|episodic)
  ${chalk.cyan('/help')}              Show this message
`

export async function startCLI(
  provider: LLMProvider,
  engine: AssistantEngine,
  context: ConversationContext,
  memory?: LongTermMemory,
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
    console.log(chalk.dim(`  Memory: ${stats.total} stored\n`))
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: chalk.cyan(`[${provider.model}] `) + chalk.bold('> '),
  })

  rl.prompt()

  rl.on('line', async (line) => {
    const input = line.trim()
    if (!input) { rl.prompt(); return }

    if (input.startsWith('/')) {
      const parts = input.split(' ')
      const cmd = parts[0]?.toLowerCase()

      switch (cmd) {
        case '/exit':
          console.log(chalk.dim('Goodbye.'))
          rl.close()
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
              const toolTag = m.supportsTools ? chalk.green(' [tools]') : ''
              console.log(`  ${m.name}${toolTag}`)
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

        case '/memory': {
          if (!memory) { console.log(chalk.yellow('Memory not enabled.')); break }
          const sub = parts[1]?.toLowerCase()

          if (!sub) {
            const s = memory.getStats()
            console.log(chalk.bold('\nMemory stats:'))
            console.log(`  Total:   ${s.total}`)
            console.log(`  Facts:   ${s.byType.fact}`)
            console.log(`  Prefs:   ${s.byType.preference}`)
            console.log(`  Context: ${s.byType.context}`)
            console.log(`  Episodic:${s.byType.episodic}`)
            console.log(`  Avg importance: ${s.avgImportance}`)
            if (s.mostAccessed) console.log(`  Most accessed: "${s.mostAccessed.content.slice(0, 60)}"`)
            console.log()
          } else if (sub === 'list') {
            const recent = memory.getRecent(10)
            if (recent.length === 0) { console.log(chalk.dim('No memories yet.')); break }
            console.log(chalk.bold('\nRecent memories:'))
            for (const m of recent) {
              console.log(`  ${chalk.cyan(`[${m.type}]`)} ${chalk.dim(`imp:${m.importance}`)} ${m.content.slice(0, 80)}`)
            }
            console.log()
          } else if (sub === 'search') {
            const query = parts.slice(2).join(' ')
            if (!query) { console.log(chalk.yellow('Usage: /memory search <query>')); break }
            const results = memory.search(query, 10)
            if (results.length === 0) { console.log(chalk.dim(`No results for "${query}".`)); break }
            console.log(chalk.bold(`\nResults for "${query}":`))
            for (const m of results) {
              console.log(`  ${chalk.cyan(`[${m.type}]`)} ${chalk.dim(`imp:${m.importance} acc:${m.access_count}`)} ${m.content.slice(0, 80)}`)
            }
            console.log()
          } else if (sub === 'save') {
            const rest = parts.slice(2).join(' ')
            // /memory save <type> <content>
            const typeArg = parts[2] as string | undefined
            const content = parts.slice(3).join(' ')
            const validTypes = ['fact', 'preference', 'context', 'episodic']
            if (!typeArg || !validTypes.includes(typeArg) || !content) {
              console.log(chalk.yellow('Usage: /memory save <fact|preference|context|episodic> <content>'))
              break
            }
            const saved = memory.save({ content, type: typeArg as 'fact' | 'preference' | 'context' | 'episodic', importance: 7 })
            console.log(chalk.green(`✓ Saved [${saved.type}]: ${saved.content.slice(0, 60)}`))
            void rest
          } else {
            console.log(chalk.yellow(`Unknown: /memory ${sub}. Try /help.`))
          }
          break
        }

        case '/help':
          console.log(HELP)
          break

        default:
          console.log(chalk.yellow(`Unknown command: ${cmd}. Type /help.`))
      }

      rl.prompt()
      return
    }

    process.stdout.write(chalk.dim('\nAssistant: '))
    try {
      for await (const chunk of engine.chat(input)) {
        if (chunk.type === 'text') process.stdout.write(chunk.delta)
        else if (chunk.type === 'error') console.error(chalk.red(`\nError: ${chunk.message}`))
        else if (chunk.type === 'done' && chunk.usage) {
          console.log(chalk.dim(`\n  [${chunk.usage.input}in / ${chunk.usage.output}out tokens]`))
        }
      }
    } catch (err) {
      logger.error('cli', 'chat error', err)
      console.error(chalk.red('\nChat failed — check /logs for details.'))
    }
    console.log()
    rl.prompt()
  })

  rl.on('close', () => { console.log(chalk.dim('\nSession ended.')) })
}
