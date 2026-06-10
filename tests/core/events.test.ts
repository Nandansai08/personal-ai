import { describe, it, expect, vi } from 'vitest'
import { eventBus } from '../../src/core/events.js'

describe('EventBus', () => {
  it('fires handler when event is emitted', () => {
    const handler = vi.fn()
    eventBus.on('session_ended', handler)
    eventBus.emit('session_ended', { messageCount: 3, toolCallCount: 1 })
    expect(handler).toHaveBeenCalledWith({ messageCount: 3, toolCallCount: 1 })
  })

  it('unsubscribe stops future calls', () => {
    const handler = vi.fn()
    const unsub = eventBus.on('session_ended', handler)
    unsub()
    eventBus.emit('session_ended', { messageCount: 0, toolCallCount: 0 })
    expect(handler).not.toHaveBeenCalled()
  })

  it('once fires exactly one time', () => {
    const handler = vi.fn()
    eventBus.once('session_ended', handler)
    eventBus.emit('session_ended', { messageCount: 1, toolCallCount: 0 })
    eventBus.emit('session_ended', { messageCount: 2, toolCallCount: 0 })
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('handler errors do not crash the bus', () => {
    eventBus.on('session_ended', () => { throw new Error('boom') })
    expect(() =>
      eventBus.emit('session_ended', { messageCount: 0, toolCallCount: 0 })
    ).not.toThrow()
  })

  it('multiple handlers all fire', () => {
    const a = vi.fn(); const b = vi.fn()
    eventBus.on('tokens_used', a)
    eventBus.on('tokens_used', b)
    eventBus.emit('tokens_used', { input: 10, output: 20, provider: 'ollama' })
    expect(a).toHaveBeenCalled()
    expect(b).toHaveBeenCalled()
  })
})
