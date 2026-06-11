// MIT License — personal-ai
// Plugin discovery: scan plugin directories, read + validate manifests,
// import entry modules. Invalid plugins are rejected with a reason and
// never crash startup.

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { pathToFileURL } from 'node:url'
import type { PluginManifest, ManifestResult, PersonalAIPlugin } from './types.js'

const NAME_RE    = /^[a-z0-9][a-z0-9-]*$/
const VERSION_RE = /^\d+\.\d+\.\d+/

/** Validate a parsed plugin.json object. */
export function validateManifest(raw: unknown): ManifestResult {
  if (typeof raw !== 'object' || raw === null) return { ok: false, error: 'manifest is not an object' }
  const m = raw as Record<string, unknown>

  if (typeof m['name'] !== 'string' || !NAME_RE.test(m['name'])) {
    return { ok: false, error: `invalid name (kebab-case required): ${String(m['name'])}` }
  }
  if (typeof m['version'] !== 'string' || !VERSION_RE.test(m['version'])) {
    return { ok: false, error: `invalid version (semver required): ${String(m['version'])}` }
  }
  if (typeof m['description'] !== 'string' || m['description'].length === 0) {
    return { ok: false, error: 'description required' }
  }
  if (typeof m['main'] !== 'string' || !/\.(js|mjs|cjs)$/.test(m['main'])) {
    return { ok: false, error: `main must point to a .js module: ${String(m['main'])}` }
  }
  if (m['main'].includes('..')) {
    return { ok: false, error: 'main must not escape the plugin directory' }
  }
  if (typeof m['enabled'] !== 'boolean') {
    return { ok: false, error: 'enabled must be a boolean' }
  }

  return {
    ok: true,
    manifest: {
      name: m['name'], version: m['version'], description: m['description'],
      main: m['main'], enabled: m['enabled'],
    },
  }
}

/** Directories scanned for plugins, in order. Override with PLUGINS_DIR. */
export function pluginDirs(packageRoot: string): string[] {
  const override = process.env['PLUGINS_DIR']
  if (override) return [path.resolve(override)]
  return [
    path.join(packageRoot, 'plugins'),
    path.join(os.homedir(), '.personal-ai', 'plugins'),
  ]
}

export interface DiscoveredPlugin {
  dir: string
  result: ManifestResult
}

/** Scan plugin directories for subdirs containing plugin.json. */
export function discoverPlugins(roots: string[]): DiscoveredPlugin[] {
  const found: DiscoveredPlugin[] = []
  const seen = new Set<string>()

  for (const root of roots) {
    if (!fs.existsSync(root)) continue
    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      const dir = path.join(root, entry.name)
      const manifestPath = path.join(dir, 'plugin.json')
      if (!fs.existsSync(manifestPath)) continue

      let result: ManifestResult
      try {
        result = validateManifest(JSON.parse(fs.readFileSync(manifestPath, 'utf8')))
      } catch (err) {
        result = { ok: false, error: `plugin.json parse error: ${err instanceof Error ? err.message : String(err)}` }
      }
      // First occurrence of a name wins (package plugins shadow home-dir ones)
      if (result.ok) {
        if (seen.has(result.manifest.name)) continue
        seen.add(result.manifest.name)
      }
      found.push({ dir, result })
    }
  }
  return found
}

/**
 * Import a plugin's entry module. Accepts `export default plugin` or
 * `export const plugin`. Returns an error string instead of throwing.
 */
export async function importPlugin(dir: string, manifest: PluginManifest): Promise<
  { ok: true; plugin: PersonalAIPlugin } | { ok: false; error: string }
> {
  const entry = path.resolve(dir, manifest.main)
  if (!fs.existsSync(entry)) return { ok: false, error: `entry not found: ${manifest.main}` }
  try {
    // Cache-bust so reload() picks up edited plugin code
    const mod = await import(`${pathToFileURL(entry).href}?t=${Date.now()}`) as
      { default?: PersonalAIPlugin; plugin?: PersonalAIPlugin }
    const plugin = mod.default ?? mod.plugin
    if (!plugin || typeof plugin.name !== 'string') {
      return { ok: false, error: 'module must export a PersonalAIPlugin as default or `plugin`' }
    }
    return { ok: true, plugin }
  } catch (err) {
    return { ok: false, error: `import failed: ${err instanceof Error ? err.message : String(err)}` }
  }
}
