// MIT License — personal-ai
import readline from 'node:readline'
import chalk from 'chalk'
import type { AssistantEngine } from '../core/assistant.js'
import type { LLMProvider } from '../providers/interface.js'
import { logger } from '../core/logger.js'
import { ConversationContext } from '../core/context.js'

const BANNER = `
${chalk.cyan('╔═══════════════════════════════════════╗')}
${chalk.cyan('║')}  ${chalk.bold('PersonalAI')} ${chalk.dim('v0.1.0')}                   ${chalk.cyan('║')}
${chalk.cyan('║')}  ${chalk.dim('Local-first. Any model.')}              ${chalk.cyan('║')}
${chalk.cyan('╚═══════════════════════════════════════╝')}
`

const HELP = `
  ${chalk.bold('Commands')}
  ${chalk.cyan('/exit')}     Quit
  ${chalk.cyan('/clear')}    Clear conversation history
  ${chalk.cyan('/models')}   List available models
  ${chalk.cyan('/health')}   Check provider health
  ${chalk.cyan('/logs')}     Show log file path
  ${chalk.cyan('/help')}     Show this message
`

export async function startCLI(
  provider: LLMProvider,
  engine: AssistantEngine,
  context: ConversationContext,
): Promise<void> {
  console.log(BANNER)

  // Health check on startup
  if (provider.healthCheck) {
    process.stdout.write(chalk.dim('Connecting to provider…'))
    const health = await provider.healthCheck()
    if (health.ok) {
      console.log(`\r${chalk.green('✓')} ${provider.name} / ${chalk.bold(health.model)} ${chalk.dim(`(${health.latencyMs}ms)`)}\n`)
    } else {
      console.log(`\r${chalk.red('✗')} ${provider.name} unreachable: ${health.error ?? 'unknown error'}`)
      console.log(chalk.yellow('  Start Ollama or set PROVIDER env var.\n'))
    }
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

    // Slash commands
    if (input.startsWith('/')) {
      const cmd = input.split(' ')[0]?.toLowerCase()
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
            if (h.ok) {
              console.log(chalk.green(`✓ OK — ${h.model} (${h.latencyMs}ms)`))
            } else {
              console.log(chalk.red(`✗ ${h.error ?? 'unhealthy'}`))
            }
          }
          break
        case '/logs':
          console.log(chalk.dim(logger.getLogPath()))
          break
        case '/help':
          console.log(HELP)
          break
        default:
          console.log(chalk.yellow(`Unknown command: ${cmd}. Type /help.`))
      }
      rl.prompt()
      return
    }

    // Chat
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

  rl.on('close', () => {
    console.log(chalk.dim('\nSession ended.'))
  })
}
