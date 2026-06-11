// MIT License — personal-ai
// Example plugin. Plain ESM JavaScript — no build step required.

/** @type {import('../../src/plugins/types.js').PersonalAIPlugin} */
const plugin = {
  name: 'hello-world',
  version: '1.0.0',
  description: 'Example plugin — greeting tool and a beforePrompt hook',

  tools: [
    {
      definition: {
        name: 'hello_world',
        description: 'Returns a greeting from the hello-world plugin.',
        parameters: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Who to greet (optional)' },
          },
        },
      },
      async execute(args) {
        const who = (args && typeof args === 'object' && 'name' in args && args.name) || 'world'
        return { success: true, data: `Hello, ${who} — from the hello-world plugin!` }
      },
    },
  ],

  hooks: {
    // Demonstrates a prompt hook: appends one line to the system prompt.
    async beforePrompt(prompt) {
      return prompt + '\n(hello-world plugin is active)'
    },
  },
}

export default plugin
