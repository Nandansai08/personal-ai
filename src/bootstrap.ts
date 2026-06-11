// MIT License — personal-ai
import path from 'node:path'
import { createProvider } from './providers/factory.js'
import { LongTermMemory } from './memory/long-term.js'
import { createOllamaEmbedder } from './memory/embeddings.js'
import { loadPersona, loadProfiles } from './persona/loader.js'
import { ProfileManager } from './persona/profiles.js'
import { toolRegistry } from './tools/registry.js'
import { webSearchTool } from './tools/web-search.js'
import { notesTool } from './tools/notes.js'
import { tasksTool } from './tools/tasks.js'
import { calculatorTool } from './tools/calculator.js'
import { fileReaderTool } from './tools/file-reader.js'
import { createMemoryTool } from './tools/memory-tool.js'
import { createPluginManager, type PluginManager } from './plugins/manager.js'
import type { LLMProvider } from './providers/interface.js'
import type { PersonaConfig } from './persona/types.js'

export interface AppCore {
  provider:       LLMProvider
  profileManager: ProfileManager
  memory:         LongTermMemory
  persona:        PersonaConfig
  plugins:        PluginManager
}

export type AppCoreResult =
  | { ok: true;  core: AppCore }
  | { ok: false; error: string }

/** Load persona + profiles, initialise provider + tools. Never throws. */
export async function createAppCore(configDir: string): Promise<AppCoreResult> {
  const persona        = loadPersona(path.join(configDir, 'persona.yaml'))
  const profilesCfg    = loadProfiles(path.join(configDir, 'profiles.yaml'))
  const profileManager = new ProfileManager(profilesCfg)

  let provider: LLMProvider
  try {
    provider = await createProvider()
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }

  const memory = new LongTermMemory()
  // Semantic memory: local embeddings via Ollama (nomic-embed-text). Degrades
  // silently to keyword search if Ollama or the model is unavailable.
  memory.setEmbedder(createOllamaEmbedder())
  registerDefaultTools(memory)

  // Plugins: local extensions (custom tools + hooks). MCP remains the path
  // for external integrations. A failing plugin never blocks startup.
  const plugins = createPluginManager(toolRegistry, path.join(configDir, '..'))
  const loaded = await plugins.loadAll()
  toolRegistry.setObserver(plugins.hooks)
  memory.setOnStored(m => { void plugins.hooks.memoryStored(m) })
  if (loaded > 0) {
    for (const p of plugins.list().filter(r => r.status === 'healthy')) {
      console.log(`✓ Plugin: ${p.manifest.name} loaded`)
    }
    console.log(`\n${loaded} plugin${loaded === 1 ? '' : 's'} active\n`)
  }

  return { ok: true, core: { provider, profileManager, memory, persona, plugins } }
}

function registerDefaultTools(memory: LongTermMemory): void {
  toolRegistry.register(webSearchTool)
  toolRegistry.register(notesTool)
  toolRegistry.register(tasksTool)
  toolRegistry.register(calculatorTool)
  toolRegistry.register(fileReaderTool)
  toolRegistry.register(createMemoryTool(memory))
}
