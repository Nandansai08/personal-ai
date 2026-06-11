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
  /** Dangerous tools (file access, etc.) require user confirmation before each call. */
  requiresConfirmation?: boolean
  execute(args: unknown): Promise<ToolResult>
}

/** Asks the user to approve a dangerous tool call. Return false to deny. */
export type ConfirmHandler = (name: string, args: unknown) => Promise<boolean>
