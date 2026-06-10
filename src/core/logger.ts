// MIT License — personal-ai
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { eventBus } from './events.js'

type LogLevel = 'debug' | 'info' | 'warn' | 'error'

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 }

class Logger {
  private logLevel: LogLevel = (process.env['LOG_LEVEL'] as LogLevel | undefined) ?? 'info'
  private logDir = path.join(os.homedir(), '.personal-ai', 'logs')
  private today = new Date().toISOString().split('T')[0]!

  debug(context: string, message: string, data?: unknown): void {
    this.write('debug', context, message, data)
  }
  info(context: string, message: string, data?: unknown): void {
    this.write('info', context, message, data)
  }
  warn(context: string, message: string, data?: unknown): void {
    this.write('warn', context, message, data)
  }
  error(context: string, message: string, error?: unknown): void {
    this.write('error', context, message, error)
  }

  /** Returns the path to today's log file. */
  getLogPath(): string {
    return path.join(this.logDir, `app-${this.today}.log`)
  }

  private write(level: LogLevel, context: string, message: string, data?: unknown): void {
    const now = new Date()
    const hms = now.toTimeString().slice(0, 8)

    // Console — only if level >= configured minimum
    if (LEVEL_ORDER[level] >= LEVEL_ORDER[this.logLevel]) {
      const colors: Record<LogLevel, string> = {
        debug: '\x1b[90m',
        info:  '\x1b[37m',
        warn:  '\x1b[33m',
        error: '\x1b[31m',
      }
      const reset = '\x1b[0m'
      const label = `${colors[level]}[${hms}] [${level.toUpperCase().padEnd(5)}] [${context}]${reset}`
      if (data !== undefined) {
        console.error(label, message, data)
      } else {
        console.error(label, message)
      }
    }

    // File — always write
    const entry = JSON.stringify({
      ts: now.toISOString(),
      level,
      context,
      message,
      ...(data !== undefined ? { data } : {}),
    })
    try {
      if (!fs.existsSync(this.logDir)) fs.mkdirSync(this.logDir, { recursive: true })
      fs.appendFileSync(this.getLogPath(), entry + '\n')
    } catch { /* never crash on log failure */ }
  }
}

export const logger = new Logger()

// Auto-wire key events
eventBus.on('error', ({ context, message, stack }) =>
  logger.error('event:error', message, { context, stack }))

eventBus.on('tool_called', ({ name, durationMs }) =>
  logger.debug('tool', `called: ${name}`, { durationMs }))

eventBus.on('provider_latency', ({ provider, model, latencyMs }) =>
  logger.debug('provider', `${provider}/${model} ${latencyMs}ms`))
