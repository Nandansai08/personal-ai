// MIT License — personal-ai
// Standalone web server entrypoint — `npm run web`
import 'dotenv/config'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createProvider } from './providers/factory.js'
import { LongTermMemory } from './memory/long-term.js'
import { loadPersona, loadProfiles, watchPersona, watchProfiles } from './persona/loader.js'
import { ProfileManager } from './persona/profiles.js'
import { ModelManager, defaultModelsConfig } from './core/model-manager.js'
import { createWebServer, getServerUrl } from './ui/web/server.js'
import { logger } from './core/logger.js'
import { toolRegistry } from './tools/registry.js'
import { webSearchTool } from './tools/web-search.js'
import { notesTool } from './tools/notes.js'
import { tasksTool } from './tools/tasks.js'
import { calculatorTool } from './tools/calculator.js'
import { fileReaderTool } from './tools/file-reader.js'
import { createMemoryTool } from './tools/memory-tool.js'

void logger

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const CONFIG    = path.join(__dirname, '..', 'config')

async function main(): Promise<void> {
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

  const memory = new LongTermMemory()

  toolRegistry.register(webSearchTool)
  toolRegistry.register(notesTool)
  toolRegistry.register(tasksTool)
  toolRegistry.register(calculatorTool)
  toolRegistry.register(fileReaderTool)
  toolRegistry.register(createMemoryTool(memory))

  watchPersona(path.join(CONFIG, 'persona.yaml'), () => {})
  watchProfiles(path.join(CONFIG, 'profiles.yaml'), p => profileManager.reload(p))

  // Web UI: two-model routing — qwen2.5:14b for tools/logic, gemma3:12b for chat/research/tutor
  const defaultModel = process.env['OLLAMA_MODEL']      ?? 'qwen2.5:14b'
  const chatModel    = process.env['OLLAMA_CHAT_MODEL'] ?? 'gemma3:12b'
  const modelManager = provider.name === 'ollama'
    ? new ModelManager({
        default: defaultModel,
        tasks: {
          tools:       defaultModel,
          coding:      defaultModel,
          reasoning:   defaultModel,
          chat:        chatModel,
          longcontext: chatModel,
          quick:       chatModel,
        },
      }, profileManager)
    : undefined

  const port = parseInt(process.env['PORT'] ?? '3000', 10)

  createWebServer({
    provider,
    memory,
    profileManager,
    registry: toolRegistry,
    modelManager,
    personaPath: path.join(CONFIG, 'persona.yaml'),
    port,
  })

  const url = getServerUrl(port)
  console.log(`\n  PersonalAI Web UI`)
  console.log(`  ${url}\n`)

  process.on('SIGINT', () => {
    memory.close()
    console.log('\nBye.')
    process.exit(0)
  })
}

main().catch(err => { console.error(err); process.exit(1) })
