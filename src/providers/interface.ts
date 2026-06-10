// MIT License — personal-ai

export interface Message {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
  tool_call_id?: string
  name?: string
}

export interface ToolParameter {
  type: string
  description?: string
  enum?: string[]
  items?: ToolParameter
  properties?: Record<string, ToolParameter>
  required?: string[]
}

export interface ToolDefinition {
  name: string
  description: string
  parameters: {
    type: 'object'
    properties: Record<string, ToolParameter>
    required?: string[]
  }
}

export interface ChatRequest {
  messages: Message[]
  tools?: ToolDefinition[]
  temperature?: number
  maxTokens?: number
  systemPrompt?: string
  model?: string
}

export interface TokenUsage {
  input: number
  output: number
}

// ChatChunk union — all possible streaming events
export type ChatChunk =
  | { type: 'text';         delta: string }
  | { type: 'tool_call';    id: string; name: string; arguments: unknown }
  | { type: 'tool_result';  id: string; name: string; result: unknown }
  | { type: 'model_switch'; from: string; to: string }
  | { type: 'done';         usage?: TokenUsage }
  | { type: 'error';        message: string }

export interface ProviderHealth {
  ok: boolean
  latencyMs: number
  model: string
  error?: string
}

export interface ModelInfo {
  id: string
  name: string
  contextLength?: number
  supportsTools?: boolean
}

/** Every provider must implement this interface. */
export interface LLMProvider {
  readonly name: string
  readonly supportsToolUse: boolean
  readonly supportsStreaming: boolean
  readonly model: string

  /**
   * Stream a chat response as ChatChunk events.
   */
  chat(request: ChatRequest): AsyncGenerator<ChatChunk>

  healthCheck?(): Promise<ProviderHealth>
  listModels?(): Promise<ModelInfo[]>
}
