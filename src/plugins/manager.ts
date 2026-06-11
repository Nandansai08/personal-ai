// MIT License — personal-ai
// PluginManager — lifecycle orchestration. Discovers plugins, loads enabled
// ones, registers their tools into the shared ToolRegistry and their hooks
// into the HookRunner. A failing plugin is reported and skipped; the
// assistant always keeps running.

import fs from 'node:fs'
import path from 'node:path'
import { logger } from '../core/logger.js'
import { discoverPlugins, importPlugin, pluginDirs } from './loader.js'
import { PluginRegistry } from './registry.js'
import { HookRunner } from './hooks.js'
import { sandboxed, LIFECYCLE_TIMEOUT_MS } from './sandbox.js'
import type { PluginRecord } from './types.js'
import type { ToolRegistry } from '../tools/registry.js'

export interface PluginHealth {
  name: string
  version: string
  status: string
  tools: number
  hooks: number
  failures: number
  error?: string
}

export class PluginManager {
  private registry = new PluginRegistry()
  readonly hooks = new HookRunner()

  constructor(
    private toolRegistry: ToolRegistry,
    private roots: string[],
  ) {}

  /** Discover and load every enabled plugin. Returns loaded count. */
  async loadAll(): Promise<number> {
    let loaded = 0
    for (const { dir, result } of discoverPlugins(this.roots)) {
      if (!result.ok) {
        logger.warn('plugins', `rejected ${path.basename(dir)}: ${result.error}`)
        continue
      }
      const record: PluginRecord = {
        manifest: result.manifest, dir,
        status: result.manifest.enabled ? 'failed' : 'disabled',
        toolCount: 0, hookCount: 0, failureCount: 0,
      }
      this.registry.set(record)
      if (!result.manifest.enabled) continue
      if (await this.activate(record)) loaded++
    }
    return loaded
  }

  /** Load (or re-activate) one plugin by name. */
  async load(name: string): Promise<PluginRecord | undefined> {
    const record = this.registry.get(name)
    if (!record) return undefined
    await this.activate(record)
    return record
  }

  /** Unload one plugin: shutdown, remove tools + hooks. */
  async unload(name: string): Promise<boolean> {
    const record = this.registry.get(name)
    if (!record || !record.plugin) return false

    if (record.plugin.shutdown) {
      await sandboxed(name, 'shutdown', () => record.plugin!.shutdown!(), LIFECYCLE_TIMEOUT_MS)
    }
    for (const tool of record.plugin.tools ?? []) {
      this.toolRegistry.unregister(tool.definition.name)
    }
    this.hooks.unregister(name)
    record.plugin = undefined
    record.status = 'disabled'
    record.toolCount = 0
    record.hookCount = 0
    return true
  }

  /** Reload one plugin from disk (picks up code + manifest changes). */
  async reload(name: string): Promise<PluginRecord | undefined> {
    const record = this.registry.get(name)
    if (!record) return undefined
    await this.unload(name)

    // Re-read manifest in case enabled/version changed
    try {
      const manifestPath = path.join(record.dir, 'plugin.json')
      const raw = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as PluginRecord['manifest']
      record.manifest = raw
    } catch { /* keep previous manifest */ }

    if (record.manifest.enabled) await this.activate(record)
    return record
  }

  /** Enable/disable persists to plugin.json so the state survives restarts. */
  async setEnabled(name: string, enabled: boolean): Promise<PluginRecord | undefined> {
    const record = this.registry.get(name)
    if (!record) return undefined
    record.manifest.enabled = enabled
    try {
      fs.writeFileSync(path.join(record.dir, 'plugin.json'), JSON.stringify(record.manifest, null, 2) + '\n')
    } catch (err) {
      logger.warn('plugins', `could not persist enabled state for ${name}: ${String(err)}`)
    }
    if (enabled) await this.activate(record)
    else await this.unload(name)
    return record
  }

  list(): PluginRecord[] {
    return this.registry.list()
  }

  health(): PluginHealth[] {
    return this.registry.list().map(r => ({
      name: r.manifest.name,
      version: r.manifest.version,
      status: r.failureCount > 0 && r.status === 'healthy' ? `healthy (${r.failureCount} hook failures)` : r.status,
      tools: r.toolCount,
      hooks: r.hookCount,
      failures: r.failureCount,
      ...(r.error ? { error: r.error } : {}),
    }))
  }

  private async activate(record: PluginRecord): Promise<boolean> {
    const start = Date.now()
    const name = record.manifest.name

    const imported = await importPlugin(record.dir, record.manifest)
    if (!imported.ok) {
      record.status = 'failed'
      record.error = imported.error
      logger.warn('plugins', `⚠ Plugin ${name} failed: ${imported.error}`)
      return false
    }

    const plugin = imported.plugin
    if (plugin.initialize) {
      const init = await sandboxed(name, 'initialize', () => plugin.initialize!(), LIFECYCLE_TIMEOUT_MS)
      if (!init.ok) {
        record.status = 'failed'
        record.error = `initialize: ${init.error}`
        logger.warn('plugins', `⚠ Plugin ${name} failed: ${record.error}`)
        return false
      }
    }

    for (const tool of plugin.tools ?? []) {
      this.toolRegistry.register(tool)
    }
    record.plugin = plugin
    record.toolCount = plugin.tools?.length ?? 0
    record.hookCount = plugin.hooks ? Object.keys(plugin.hooks).length : 0
    record.status = 'healthy'
    record.error = undefined
    record.loadMs = Date.now() - start
    this.hooks.register(record)
    logger.debug('plugins', `loaded ${name} v${record.manifest.version} (${record.toolCount} tools, ${record.hookCount} hooks, ${record.loadMs}ms)`)
    return true
  }
}

/** Construct a manager scanning the default plugin directories. */
export function createPluginManager(toolRegistry: ToolRegistry, packageRoot: string): PluginManager {
  return new PluginManager(toolRegistry, pluginDirs(packageRoot))
}
