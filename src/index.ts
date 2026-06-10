// MIT License — personal-ai
import 'dotenv/config'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createProvider } from './providers/factory.js'
import { ConversationContext } from './core/context.js'
import { AssistantEngine } from './core/assistant.js'
import { LongTermMemory } from './memory/long-term.js'
import { loadPersona, loadProfiles, watchPersona, watchProfiles } from './persona/loader.js'
import { ProfileManager } from './persona/profiles.js'
import { buildSystemPrompt, isGemma3Model } from './persona/system-prompt.js'
import { startCLI } from './ui/cli.js'
import { eventBus } from './core/events.js'
import { logger } from './core/logger.js'

void logger

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const CONFIG    = path.join(__dirname, '..', 'config')

async function main(): Promise<void> {
  // Load persona + profiles
  const persona        = loadPersona(path.join(CONFIG, 'persona.yaml'))
  const profilesCfg    = loadProfiles(path.join(CONFIG, 'profiles.yaml'))
  const profileManager = new ProfileManager(profilesCfg)

  let provider
  try {
    provider = await createProvider()
  } catch (err) {
    console.error('Failed to initialize provider:', err)
    process.exit(1)
  }

  const memory  = new LongTermMemory()
  const context = new ConversationContext()

  let currentPersona = persona

  // Hot-reload config files
  watchPersona(path.join(CONFIG, 'persona.yaml'), p => { currentPersona = p })
  watchProfiles(path.join(CONFIG, 'profiles.yaml'), p => profileManager.reload(p))

  const getSystemPrompt = () => buildSystemPrompt(
    currentPersona,
    profileManager.getActive(),
    [],
    '',
    new Date(),
    isGemma3Model(provider.model),
  )

  const engine = new AssistantEngine(provider, getSystemPrompt, context, memory, profileManager)

  process.on('SIGINT', () => {
    eventBus.emit('session_ended', {
      messageCount:  context.messageCount,
      toolCallCount: context.getToolCallCount(),
    })
    memory.close()
    console.log('\nBye.')
    process.exit(0)
  })

  await startCLI(provider, engine, context, memory, profileManager)
}

main().catch(err => { console.error(err); process.exit(1) })
