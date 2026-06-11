// MIT License — personal-ai
import 'dotenv/config'
import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'
import { fileURLToPath } from 'node:url'
import { ConversationContext } from './core/context.js'
import { AssistantEngine } from './core/assistant.js'
import { watchPersona, watchProfiles } from './persona/loader.js'
import { buildSystemPrompt, isGemma3Model } from './persona/system-prompt.js'
import { startCLI } from './ui/cli.js'
import { needsSetup, runSetupWizard } from './ui/setup.js'
import { ModelManager, defaultModelsConfig } from './core/model-manager.js'
import { eventBus } from './core/events.js'
import { logger } from './core/logger.js'
import { toolRegistry } from './tools/registry.js'
import { createAppCore } from './bootstrap.js'
import type { Memory } from './memory/types.js'

void logger

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const CONFIG    = path.join(__dirname, '..', 'config')

/**
 * Resolve the .env location. Repo checkouts use the package-local .env;
 * npx / global installs fall back to ~/.personal-ai/.env so config survives
 * npm cache cleanup.
 */
function resolveEnvPath(): string {
  const localEnv = path.join(__dirname, '..', '.env')
  if (fs.existsSync(localEnv)) return localEnv
  return path.join(os.homedir(), '.personal-ai', '.env')
}

async function main(): Promise<void> {
  if (process.argv.includes('--version') || process.argv.includes('-v')) {
    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8')) as { version: string }
    console.log(`personal-ai v${pkg.version}`)
    return
  }

  const envPath = resolveEnvPath()
  const { config } = await import('dotenv')
  config({ path: envPath })

  if (needsSetup(envPath)) {
    fs.mkdirSync(path.dirname(envPath), { recursive: true })
    await runSetupWizard(envPath)
    // re-load env after wizard writes .env
    config({ path: envPath, override: true })
  }

  const boot = await createAppCore(CONFIG)
  if (!boot.ok) {
    console.error(`Failed to initialize provider: ${boot.error}`)
    process.exit(1)
  }
  const { provider, profileManager, memory, persona } = boot.core
  const context = new ConversationContext()

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

  const engine = new AssistantEngine({
    provider, getSystemPrompt, memory,
    registry: toolRegistry, profileManager, context, modelManager,
  })

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
  let webToken: string | undefined

  const startWebFn = async (): Promise<string> => {
    // Lazy import — keeps express/ws/cors out of CLI startup entirely
    const { createWebServer, getServerUrl } = await import('./ui/web/server.js')
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
      webToken  = result.token
    }
    return getServerUrl(webPort!, webToken)
  }

  const reloadProvider = async () => {
    const { createProvider } = await import('./providers/factory.js')
    return createProvider()
  }

  await startCLI(provider, engine, context, memory, profileManager, toolRegistry, modelManager, startWebFn, reloadProvider, envPath)
}

main().catch(err => { console.error(err); process.exit(1) })
