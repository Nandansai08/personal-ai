// MIT License — personal-ai
import { describe, it, expect, beforeEach } from 'vitest'
import { ModelManager, defaultModelsConfig } from '../../src/core/model-manager.js'

const cfg = {
  default: 'qwen2.5:14b',
  tasks: {
    tools:       'qwen2.5:14b',
    coding:      'qwen2.5-coder:7b',
    reasoning:   'qwen2.5:14b',
    chat:        'gemma3:12b',
    longcontext: 'gemma3:12b',
    quick:       'gemma3:12b',
  },
}

describe('ModelManager.detectTask', () => {
  let mgr: ModelManager
  beforeEach(() => { mgr = new ModelManager(cfg) })

  it('returns quick for short messages', () => {
    expect(mgr.detectTask('hi', 0)).toBe('quick')
  })

  it('returns longcontext for long messages', () => {
    expect(mgr.detectTask('x'.repeat(1501), 0)).toBe('longcontext')
  })

  it('returns longcontext for large context', () => {
    expect(mgr.detectTask('what is the capital of France?', 30)).toBe('longcontext')
  })

  it('returns coding for code-related messages', () => {
    expect(mgr.detectTask('write a TypeScript function to parse JSON', 0)).toBe('coding')
  })

  it('returns tools for action messages', () => {
    expect(mgr.detectTask('save this note and remind me tomorrow at 9am', 0)).toBe('tools')
  })

  it('returns reasoning for analytical messages', () => {
    expect(mgr.detectTask('explain the difference between REST and GraphQL', 0)).toBe('reasoning')
  })

  it('returns chat as fallback', () => {
    expect(mgr.detectTask('tell me a story about a dragon', 0)).toBe('chat')
  })
})

describe('ModelManager.selectModel', () => {
  let mgr: ModelManager
  beforeEach(() => { mgr = new ModelManager(cfg) })

  it('returns task-specific model', () => {
    expect(mgr.selectModel('write a Python class for parsing CSV', 0)).toBe('qwen2.5-coder:7b')
  })

  it('returns manual override when set', () => {
    mgr.setModel('custom-model:latest')
    expect(mgr.selectModel('write a TypeScript function to sort arrays', 0)).toBe('custom-model:latest')
  })

  it('clears override with setAuto', () => {
    mgr.setModel('custom-model:latest')
    mgr.setAuto()
    expect(mgr.selectModel('write a TypeScript function to sort arrays', 0)).toBe('qwen2.5-coder:7b')
  })

  it('falls back to default for unknown task model', () => {
    const sparseConfig = { default: 'qwen2.5:14b', tasks: {} }
    const m = new ModelManager(sparseConfig)
    expect(m.selectModel('explain something', 0)).toBe('qwen2.5:14b')
  })

  it('respects profile override', () => {
    const profileManager = { getPreferredModel: () => 'profile-model:7b', getActive: () => ({ preferred_model: 'profile-model:7b' } as never) }
    const m = new ModelManager(cfg, profileManager as never)
    expect(m.selectModel('write code', 0)).toBe('profile-model:7b')
  })
})

describe('ModelManager.isToolCapable', () => {
  const mgr = new ModelManager(cfg)

  it('recognizes qwen2.5 models', () => {
    expect(mgr.isToolCapable('qwen2.5:14b')).toBe(true)
  })

  it('recognizes claude models', () => {
    expect(mgr.isToolCapable('claude-sonnet-4-6')).toBe(true)
  })

  it('recognizes gpt models', () => {
    expect(mgr.isToolCapable('gpt-4o-mini')).toBe(true)
  })

  it('returns false for gemma', () => {
    expect(mgr.isToolCapable('gemma3:12b')).toBe(false)
  })
})

describe('defaultModelsConfig', () => {
  it('returns a config with default and tasks', () => {
    const config = defaultModelsConfig()
    expect(config.default).toBeTypeOf('string')
    expect(config.tasks).toBeDefined()
    expect(config.tasks.tools).toBeTypeOf('string')
    expect(config.tasks.chat).toBeTypeOf('string')
    expect(config.tasks.coding).toBeTypeOf('string')
    expect(config.tasks.reasoning).toBeTypeOf('string')
    expect(config.tasks.longcontext).toBeTypeOf('string')
    expect(config.tasks.quick).toBeTypeOf('string')
  })

  it('uses env vars when set', () => {
    process.env['OLLAMA_MODEL']      = 'test-main:7b'
    process.env['OLLAMA_CHAT_MODEL'] = 'test-chat:7b'
    const config = defaultModelsConfig()
    expect(config.default).toBe('test-main:7b')
    expect(config.tasks.chat).toBe('test-chat:7b')
    delete process.env['OLLAMA_MODEL']
    delete process.env['OLLAMA_CHAT_MODEL']
  })
})
