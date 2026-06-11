// MIT License — personal-ai
// Timestamp plugin — exposes the current time as a tool.

/** @type {import('../../src/plugins/types.js').PersonalAIPlugin} */
const plugin = {
  name: 'timestamp',
  version: '1.0.0',
  description: 'Current ISO timestamp tool',

  tools: [
    {
      definition: {
        name: 'current_timestamp',
        description: 'Returns the current date and time as an ISO 8601 string.',
        parameters: { type: 'object', properties: {} },
      },
      async execute() {
        return { success: true, data: new Date().toISOString() }
      },
    },
  ],
}

export default plugin
