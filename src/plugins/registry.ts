// MIT License — personal-ai
// Plugin record store — tracks every discovered plugin and its state.
// Kept separate from the tool registry: tools are capabilities, plugin
// records are lifecycle/health bookkeeping.

import type { PluginRecord, PluginStatus } from './types.js'

export class PluginRegistry {
  private records = new Map<string, PluginRecord>()

  set(record: PluginRecord): void {
    this.records.set(record.manifest.name, record)
  }

  get(name: string): PluginRecord | undefined {
    return this.records.get(name)
  }

  delete(name: string): boolean {
    return this.records.delete(name)
  }

  list(): PluginRecord[] {
    return [...this.records.values()]
  }

  byStatus(status: PluginStatus): PluginRecord[] {
    return this.list().filter(r => r.status === status)
  }

  count(): number {
    return this.records.size
  }
}
