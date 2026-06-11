// MIT License — personal-ai
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { PluginManager } from '../../src/plugins/manager.js'
import { validateManifest } from '../../src/plugins/loader.js'
import { ToolRegistry } from '../../src/tools/registry.js'

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pai-plugins-'))

function writePlugin(name: string, manifest: object, indexJs: string): void {
  const dir = path.join(tmpRoot, name)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'plugin.json'), JSON.stringify(manifest))
  fs.writeFileSync(path.join(dir, 'index.js'), indexJs)
}

beforeAll(() => {
  writePlugin('good', {
    name: 'good', version: '1.0.0', description: 'works', main: './index.js', enabled: true,
  }, `
    export default {
      name: 'good', version: '1.0.0', description: 'works',
      tools: [{
        definition: { name: 'good_tool', description: 'test', parameters: { type: 'object', properties: {} } },
        async execute() { return { success: true, data: 'good result' } },
      }],
      hooks: {
        async beforePrompt(p) { return p + ' [good]' },
        async afterResponse(r) { return r + '!' },
      },
    }
  `)

  writePlugin('broken-manifest', { name: 'BAD NAME!!', version: 'x', main: 3 }, 'export default {}')

  writePlugin('throws-on-init', {
    name: 'throws-on-init', version: '1.0.0', description: 'fails', main: './index.js', enabled: true,
  }, `
    export default {
      name: 'throws-on-init', version: '1.0.0', description: 'fails',
      async initialize() { throw new Error('boom') },
    }
  `)

  writePlugin('slow-hook', {
    name: 'slow-hook', version: '1.0.0', description: 'times out', main: './index.js', enabled: true,
  }, `
    export default {
      name: 'slow-hook', version: '1.0.0', description: 'times out',
      hooks: { async beforePrompt(p) { await new Promise(r => setTimeout(r, 10000)); return 'never' } },
    }
  `)

  writePlugin('disabled', {
    name: 'disabled', version: '1.0.0', description: 'off', main: './index.js', enabled: false,
  }, 'export default { name: "disabled", version: "1.0.0", description: "off" }')
})

afterAll(() => fs.rmSync(tmpRoot, { recursive: true, force: true }))

describe('manifest validation', () => {
  it('accepts a valid manifest', () => {
    const r = validateManifest({ name: 'ok', version: '1.0.0', description: 'd', main: './index.js', enabled: true })
    expect(r.ok).toBe(true)
  })

  it('rejects bad names, versions, main, and missing enabled', () => {
    expect(validateManifest({ name: 'BAD!', version: '1.0.0', description: 'd', main: './i.js', enabled: true }).ok).toBe(false)
    expect(validateManifest({ name: 'ok', version: 'nope', description: 'd', main: './i.js', enabled: true }).ok).toBe(false)
    expect(validateManifest({ name: 'ok', version: '1.0.0', description: 'd', main: './i.ts', enabled: true }).ok).toBe(false)
    expect(validateManifest({ name: 'ok', version: '1.0.0', description: 'd', main: '../../etc/evil.js', enabled: true }).ok).toBe(false)
    expect(validateManifest({ name: 'ok', version: '1.0.0', description: 'd', main: './i.js' }).ok).toBe(false)
  })
})

describe('PluginManager', () => {
  it('loads enabled valid plugins, skips invalid and disabled ones', async () => {
    const registry = new ToolRegistry()
    const mgr = new PluginManager(registry, [tmpRoot])
    const loaded = await mgr.loadAll()

    expect(loaded).toBe(2) // good + slow-hook (throws-on-init fails, disabled skipped, broken-manifest rejected)
    const byName = Object.fromEntries(mgr.health().map(h => [h.name, h]))
    expect(byName['good']!.status).toBe('healthy')
    expect(byName['throws-on-init']!.status).toBe('failed')
    expect(byName['disabled']!.status).toBe('disabled')
    expect(byName['broken-manifest']).toBeUndefined()
  })

  it('registers plugin tools into the tool registry and they execute', async () => {
    const registry = new ToolRegistry()
    const mgr = new PluginManager(registry, [tmpRoot])
    await mgr.loadAll()

    expect(registry.has('good_tool')).toBe(true)
    const result = await registry.dispatch('good_tool', {})
    expect(result.success).toBe(true)
    expect(result.data).toBe('good result')
  })

  it('runs beforePrompt and afterResponse hook chains', async () => {
    const registry = new ToolRegistry()
    const mgr = new PluginManager(registry, [path.join(tmpRoot, 'good')].map(p => path.dirname(p)))
    await mgr.loadAll()

    const prompt = await mgr.hooks.beforePrompt('sys')
    expect(prompt).toContain('[good]')
    const response = await mgr.hooks.afterResponse('hi')
    expect(response.endsWith('!')).toBe(true)
  })

  it('a timing-out hook falls back to the previous value and bumps failures', async () => {
    const registry = new ToolRegistry()
    const mgr = new PluginManager(registry, [tmpRoot])
    await mgr.loadAll()

    const prompt = await mgr.hooks.beforePrompt('original')
    // slow-hook times out (2s sandbox) — chain keeps 'original' (+good's suffix)
    expect(prompt).toContain('original')
    expect(prompt).not.toContain('never')
    const slow = mgr.health().find(h => h.name === 'slow-hook')!
    expect(slow.failures).toBeGreaterThan(0)
  }, 15_000)

  it('unload removes tools; reload restores them', async () => {
    const registry = new ToolRegistry()
    const mgr = new PluginManager(registry, [tmpRoot])
    await mgr.loadAll()

    await mgr.unload('good')
    expect(registry.has('good_tool')).toBe(false)
    expect(mgr.health().find(h => h.name === 'good')!.status).toBe('disabled')

    await mgr.reload('good')
    expect(registry.has('good_tool')).toBe(true)
    expect(mgr.health().find(h => h.name === 'good')!.status).toBe('healthy')
  })

  it('setEnabled(false) persists to plugin.json', async () => {
    const registry = new ToolRegistry()
    const mgr = new PluginManager(registry, [tmpRoot])
    await mgr.loadAll()

    await mgr.setEnabled('good', false)
    const manifest = JSON.parse(fs.readFileSync(path.join(tmpRoot, 'good', 'plugin.json'), 'utf8')) as { enabled: boolean }
    expect(manifest.enabled).toBe(false)

    await mgr.setEnabled('good', true) // restore for other tests
  })
})
