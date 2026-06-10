// MIT License — personal-ai
import 'dotenv/config'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createProvider } from './providers/factory.js'
import { ConversationContext } from './core/context.js'
import { AssistantEngine } from './core/assistant.js'
import { LongTermMemory } from './memory/long-term.js'
import { loadPersona, loadProfiles, watchPersona, watchProfiles } from './persona/loader.js'
import { ProfileManager } from './persona/profiles.js'
import { buildSystemPrompt, isGemma3Model } from './persona/system-prompt.js'
import { startCLI } from './ui/cli.js'
import { needsSetup, runSetupWizard } from './ui/setup.js'
import { createWebServer, getServerUrl } from './ui/web/server.js'
import { ModelManager, defaultModelsConfig } from './core/model-manager.js'
import { eventBus } from './core/events.js'
import { logger } from './core/logger.js'
import { toolRegistry } from './tools/registry.js'
import { webSearchTool } from './tools/web-search.js'
import { notesTool } from './tools/notes.js'
import { tasksTool } from './tools/tasks.js'
import { calculatorTool } from './tools/calculator.js'
import { fileReaderTool } from './tools/file-reader.js'
import { createMemoryTool } from './tools/memory-tool.js'
import type { Memory } from './memory/types.js'

void logger

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const CONFIG    = path.join(__dirname, '..', 'config')

async function main(): Promise<void> {
  const envPath = path.join(__dirname, '..', '.env')
  if (needsSetup(envPath)) {
    await runSetupWizard(envPath)
    // re-load env after wizard writes .env
    const { config } = await import('dotenv')
    config({ path: envPath, override: true })
  }

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

  // Register all tools
  toolRegistry.register(webSearchTool)
  toolRegistry.register(notesTool)
  toolRegistry.register(tasksTool)
  toolRegistry.register(calculatorTool)
  toolRegistry.register(fileReaderTool)
  toolRegistry.register(createMemoryTool(memory))

  let currentPersona = persona

  // Hot-reload config files
  watchPersona(path.join(CONFIG, 'persona.yaml'), p => { currentPersona = p })
  watchProfiles(path.join(CONFIG, 'profiles.yaml'), p => profileManager.reload(p))

  const getSystemPrompt = (memories: Memory[], toolsSection: string) => buildSystemPrompt(
    currentPersona,
    profileManager.getActive(),
    memories,
    toolsSection,
    new Date(),
    isGemma3Model(provider.model),  // provider.model updated per-turn by ModelManager
  )

  const modelManager = provider.name === 'ollama'
    ? new ModelManager(defaultModelsConfig(), profileManager)
    : new ModelManager({ default: provider.model, tasks: {} }, profileManager)

  const engine = new AssistantEngine(provider, getSystemPrompt, memory, toolRegistry, profileManager, context, modelManager)

  process.on('SIGINT', () => {
    eventBus.emit('session_ended', {
      messageCount:  context.messageCount,
      toolCallCount: context.getToolCallCount(),
    })
    memory.close()
    console.log('\nBye.')
    process.exit(0)
  })

  let webServer: import('node:http').Server | undefined
  let webPort: number | undefined

  const startWebFn = async (): Promise<string> => {
    if (!webServer) {
      const preferred = parseInt(process.env['PORT'] ?? '3000', 10)
      const result = await createWebServer({
        provider,
        memory,
        profileManager,
        registry: toolRegistry,
        modelManager,
        personaPath: path.join(CONFIG, 'persona.yaml'),
        port: preferred,
      })
      webServer = result.server
      webPort   = result.port
    }
    return getServerUrl(webPort!)
  }

  await startCLI(provider, engine, context, memory, profileManager, toolRegistry, modelManager, startWebFn)
}

main().catch(err => { console.error(err); process.exit(1) })
