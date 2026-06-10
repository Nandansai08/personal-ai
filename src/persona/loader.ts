// MIT License — personal-ai
import fs from 'node:fs'
import yaml from 'js-yaml'
import chokidar from 'chokidar'
import { logger } from '../core/logger.js'
import {
  PersonaConfigSchema, ProfilesConfigSchema,
  type PersonaConfig, type ProfilesConfig,
} from './types.js'

function readYaml(filePath: string): unknown {
  const raw = fs.readFileSync(filePath, 'utf8')
  return yaml.load(raw)
}

/** Load and validate persona.yaml. */
export function loadPersona(filePath: string): PersonaConfig {
  const raw = readYaml(filePath)
  const result = PersonaConfigSchema.safeParse(raw)
  if (!result.success) {
    logger.warn('persona', `Invalid persona config: ${result.error.message}`)
    return PersonaConfigSchema.parse({ name: 'AI', expertise: [], avoid: [] })
  }
  logger.debug('persona', `Loaded persona: ${result.data.name}`)
  return result.data
}

/** Load and validate profiles.yaml. */
export function loadProfiles(filePath: string): ProfilesConfig {
  const raw = readYaml(filePath)
  const result = ProfilesConfigSchema.safeParse(raw)
  if (!result.success) {
    throw new Error(`Invalid profiles config: ${result.error.message}`)
  }
  logger.debug('persona', `Loaded ${Object.keys(result.data.profiles).length} profiles`)
  return result.data
}

/** Watch file for changes, call onChange with reparsed data. Returns cleanup fn. */
export function watchPersona(filePath: string, onChange: (p: PersonaConfig) => void): () => void {
  const watcher = chokidar.watch(filePath, { ignoreInitial: true })
  watcher.on('change', () => {
    try { onChange(loadPersona(filePath)) }
    catch (e) { logger.warn('persona', `watch reload failed: ${String(e)}`) }
  })
  return () => { void watcher.close() }
}

export function watchProfiles(filePath: string, onChange: (p: ProfilesConfig) => void): () => void {
  const watcher = chokidar.watch(filePath, { ignoreInitial: true })
  watcher.on('change', () => {
    try { onChange(loadProfiles(filePath)) }
    catch (e) { logger.warn('persona', `watch reload failed: ${String(e)}`) }
  })
  return () => { void watcher.close() }
}
