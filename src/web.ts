// MIT License — personal-ai
// Standalone web server entrypoint — `npm run web`
import 'dotenv/config'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { watchProfiles } from './persona/loader.js'
import { ModelManager } from './core/model-manager.js'
import { createWebServer, getServerUrl } from './ui/web/server.js'
import { logger } from './core/logger.js'
import { toolRegistry } from './tools/registry.js'
import { createAppCore } from './bootstrap.js'

void logger

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const CONFIG    = path.join(__dirname, '..', 'config')

async function main(): Promise<void> {
  const boot = await createAppCore(CONFIG)
  if (!boot.ok) {
    console.error(`Failed to initialize provider: ${boot.error}`)
    process.exit(1)
  }
  const { provider, profileManager, memory } = boot.core

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
    : new ModelManager({ default: provider.model, tasks: {} }, profileManager)

  // Pre-load both models so first request is fast
  void provider.warmUp?.(defaultModel)
  if (provider.name === 'ollama' && chatModel !== defaultModel) void provider.warmUp?.(chatModel)

  const preferred = parseInt(process.env['PORT'] ?? '3000', 10)

  const { port, token } = await createWebServer({
    provider,
    memory,
    profileManager,
    registry: toolRegistry,
    modelManager,
    personaPath: path.join(CONFIG, 'persona.yaml'),
    port: preferred,
  })

  const url = getServerUrl(port, token)
  console.log(`\n  PersonalAI Web UI`)
  console.log(`  ${url}`)
  console.log(`  (URL includes your session token — don't share it)\n`)

  process.on('SIGINT', () => {
    memory.close()
    console.log('\nBye.')
    process.exit(0)
  })
}

main().catch(err => { console.error(err); process.exit(1) })
