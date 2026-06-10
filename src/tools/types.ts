// MIT License — personal-ai
// fallow-ignore-file unused-files

export interface ToolDefinition {
  name: string
  description: string
  parameters: {
    type: 'object'
    properties: Record<string, {
      type: string
      description?: string
      enum?: string[]
    }>
    required?: string[]
  }
}

export interface ToolCall {
  id: string
  name: string
  arguments: unknown
}

export interface ToolResult {
  success: boolean
  data: unknown
  error?: string
}

export interface RegisteredTool {
  definition: ToolDefinition
  execute(args: unknown): Promise<ToolResult>
}
