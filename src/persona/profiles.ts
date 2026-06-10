// MIT License — personal-ai
import { logger } from '../core/logger.js'
import type { ProfilesConfig, ProfileConfig } from './types.js'

export class ProfileManager {
  private active: string
  private profiles: Record<string, ProfileConfig>

  constructor(private config: ProfilesConfig) {
    this.active   = config.active
    this.profiles = config.profiles
    // Fallback to 'assistant' if active doesn't exist
    if (!this.profiles[this.active]) {
      const first = Object.keys(this.profiles)[0]
      this.active = first ?? 'assistant'
      logger.warn('profile', `Active profile "${config.active}" not found, using "${this.active}"`)
    }
  }

  getActive(): ProfileConfig {
    return this.profiles[this.active]!
  }

  getActiveName(): string {
    return this.active
  }

  setActive(name: string): void {
    if (!this.profiles[name]) {
      throw new Error(`Profile "${name}" not found. Available: ${Object.keys(this.profiles).join(', ')}`)
    }
    this.active = name
    logger.debug('profile', `switched to: ${name}`)
  }

  getAll(): Record<string, ProfileConfig> {
    return this.profiles
  }

  getPromptAddon(): string {
    return this.getActive().system_addon ?? ''
  }

  getPreferredModel(): string {
    return this.getActive().preferred_model
  }

  getTemperature(): number {
    return this.getActive().temperature
  }

  /** Hot-reload when config file changes. */
  reload(config: ProfilesConfig): void {
    this.profiles = config.profiles
    if (!this.profiles[this.active]) {
      this.active = config.active
    }
    logger.debug('profile', `reloaded — active: ${this.active}`)
  }
}
