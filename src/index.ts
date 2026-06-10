// MIT License — personal-ai
import 'dotenv/config'
import { createProvider } from './providers/factory.js'
import { ConversationContext } from './core/context.js'
import { AssistantEngine } from './core/assistant.js'
import { LongTermMemory } from './memory/long-term.js'
import { startCLI } from './ui/cli.js'
import { eventBus } from './core/events.js'
import { logger } from './core/logger.js'

void logger // ensure event auto-wiring

function getSystemPrompt(): string {
  return [
    'You are PersonalAI — a helpful, concise assistant.',
    'Answer directly. Use plain text unless formatting genuinely helps.',
    `Date: ${new Date().toISOString().split('T')[0]}`,
  ].join('\n')
}

async function main(): Promise<void> {
  let provider
  try {
    provider = await createProvider()
  } catch (err) {
    console.error('Failed to initialize provider:', err)
    process.exit(1)
  }

  const memory  = new LongTermMemory()
  const context = new ConversationContext()
  const engine  = new AssistantEngine(provider, getSystemPrompt, context, memory)

  process.on('SIGINT', () => {
    eventBus.emit('session_ended', {
      messageCount: context.messageCount,
      toolCallCount: context.getToolCallCount(),
    })
    memory.close()
    console.log('\nBye.')
    process.exit(0)
  })

  await startCLI(provider, engine, context, memory)
}

main().catch(err => { console.error(err); process.exit(1) })
