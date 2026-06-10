// MIT License — personal-ai

export interface ToolResult {
  success: boolean
  data: unknown
  error?: string
}

export interface RegisteredTool {
  name: string
  description: string
  parameters: Record<string, unknown>
  execute(args: unknown): Promise<ToolResult>
}
