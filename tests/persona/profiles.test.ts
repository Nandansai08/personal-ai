import { describe, it, expect } from 'vitest'
import { ProfileManager } from '../../src/persona/profiles.js'
import type { ProfilesConfig } from '../../src/persona/types.js'

const config: ProfilesConfig = {
  active: 'assistant',
  profiles: {
    assistant: {
      name: 'Assistant', description: 'General', system_addon: '',
      preferred_model: 'qwen2.5:14b', tools_priority: [], temperature: 0.7,
    },
    coder: {
      name: 'Coder', description: 'Dev', system_addon: 'Write complete code.',
      preferred_model: 'qwen2.5-coder:7b', tools_priority: [], temperature: 0.3,
    },
    researcher: {
      name: 'Researcher', description: 'Research', system_addon: 'Cite sources.',
      preferred_model: 'gemma3:12b', tools_priority: [], temperature: 0.5,
    },
  },
}

describe('ProfileManager', () => {
  it('getActive returns default profile', () => {
    const pm = new ProfileManager(config)
    expect(pm.getActiveName()).toBe('assistant')
    expect(pm.getActive().name).toBe('Assistant')
  })

  it('setActive switches profile', () => {
    const pm = new ProfileManager(config)
    pm.setActive('coder')
    expect(pm.getActiveName()).toBe('coder')
    expect(pm.getPreferredModel()).toBe('qwen2.5-coder:7b')
    expect(pm.getTemperature()).toBe(0.3)
  })

  it('setActive throws on unknown profile', () => {
    const pm = new ProfileManager(config)
    expect(() => pm.setActive('nonexistent')).toThrow('nonexistent')
  })

  it('getAll returns all profiles', () => {
    const pm = new ProfileManager(config)
    expect(Object.keys(pm.getAll())).toHaveLength(3)
  })

  it('getPromptAddon returns system_addon', () => {
    const pm = new ProfileManager(config)
    pm.setActive('coder')
    expect(pm.getPromptAddon()).toContain('complete code')
  })

  it('fallback to first profile if active missing', () => {
    const pm = new ProfileManager({ ...config, active: 'missing' })
    expect(['assistant', 'coder', 'researcher']).toContain(pm.getActiveName())
  })

  it('reload updates profiles', () => {
    const pm = new ProfileManager(config)
    pm.reload({
      ...config,
      profiles: {
        ...config.profiles,
        coder: { ...config.profiles.coder!, temperature: 0.1 },
      },
    })
    pm.setActive('coder')
    expect(pm.getTemperature()).toBe(0.1)
  })
})
