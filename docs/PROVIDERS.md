# Provider Reference

All providers implement the same `LLMProvider` interface. Switch between them with `PROVIDER=<name>` in `.env`.

---

## Ollama (local)

**No API key required.**

| Variable | Default | Notes |
|---|---|---|
| `OLLAMA_BASE_URL` | `http://localhost:11434` | Change if running on another host |
| `OLLAMA_MODEL` | `qwen2.5:14b` | Default + tools/reasoning model |
| `OLLAMA_CODER_MODEL` | `qwen2.5-coder:7b` | Auto-selected for coding tasks |
| `OLLAMA_CHAT_MODEL` | `gemma3:12b` | Auto-selected for chat/quick/longcontext |

**Install:** https://ollama.ai

**Recommended models:**

| Model | Size | Tool Use | Best For |
|---|---|---|---|
| `qwen2.5:14b` | 9 GB | Native | Tools, reasoning, general tasks |
| `qwen2.5:7b` | 4.7 GB | Native | Faster, less RAM |
| `qwen2.5-coder:7b` | 4.7 GB | Native | Coding, TypeScript, debugging |
| `gemma3:12b` | 8.1 GB | XML fallback | Chat, long context, writing |
| `gemma3:4b` | 3.3 GB | XML fallback | Low RAM devices |
| `llama3.2:3b` | 2 GB | Native | Quick responses, low resource |
| `mistral:7b` | 4.1 GB | Native | General purpose |

**Pull models:**
```bash
ollama pull qwen2.5:14b
ollama pull gemma3:12b
ollama pull qwen2.5-coder:7b
```

**Native tool use models** (pass tools array natively):
`qwen2.5:*`, `qwen2.5-coder:*`, `llama3.1:*`, `llama3.2:*`, `mistral-nemo:*`, `mistral:*`

**XML fallback models** (tool instructions injected into system prompt):
`gemma3:*`, `gemma3n:*`, `phi4:*`, `phi3:*`, all others

---

## Anthropic

**API key required.**

Get key: https://console.anthropic.com

Free tier: None (pay-per-token, ~$3/million input tokens for Sonnet)

| Variable | Default |
|---|---|
| `ANTHROPIC_API_KEY` | Required |
| `ANTHROPIC_MODEL` | `claude-sonnet-4-6` |
| `ANTHROPIC_MAX_TOKENS` | `1024` |
| `ANTHROPIC_TEMPERATURE` | `0.7` |

**Recommended models:**

| Model | Notes |
|---|---|
| `claude-sonnet-4-6` | Best balance — recommended default |
| `claude-haiku-4-5-20251001` | Fastest, cheapest |
| `claude-opus-4-8` | Most capable, most expensive |

Tool use: native. Streaming: native.

---

## OpenAI

**API key required.**

Get key: https://platform.openai.com/api-keys

Free tier: None (pay-per-token)

| Variable | Default |
|---|---|
| `OPENAI_API_KEY` | Required |
| `OPENAI_MODEL` | `gpt-4o-mini` |
| `OPENAI_BASE_URL` | `https://api.openai.com/v1` |
| `OPENAI_TEMPERATURE` | `0.7` |

**Recommended models:**

| Model | Notes |
|---|---|
| `gpt-4o-mini` | Cheap, fast, good for most tasks |
| `gpt-4o` | Most capable GPT model |
| `o3-mini` | Reasoning model |

Tool use: native. Streaming: native.

`OPENAI_BASE_URL` can point to any OpenAI-compatible API.

---

## Groq

**Free tier available.**

Get key: https://console.groq.com/keys

Free tier: 14,400 requests/day, rate limited

| Variable | Default |
|---|---|
| `GROQ_API_KEY` | Required |
| `GROQ_MODEL` | `llama-3.3-70b-versatile` |
| `GROQ_TEMPERATURE` | `0.7` |

**Recommended models:**

| Model | Notes |
|---|---|
| `llama-3.3-70b-versatile` | Best quality on Groq |
| `llama-3.1-8b-instant` | Fastest, lowest latency |
| `mixtral-8x7b-32768` | Long context (32k) |
| `gemma2-9b-it` | Good for chat |

Tool use: native. Streaming: native. Inference speed: very fast (LPU hardware).

---

## Google Gemini

**Free tier available.**

Get key: https://aistudio.google.com/app/apikey

Free tier: 1,500 requests/day (Gemini 2.0 Flash)

| Variable | Default |
|---|---|
| `GEMINI_API_KEY` | Required |
| `GEMINI_MODEL` | `gemini-2.0-flash` |
| `GEMINI_TEMPERATURE` | `0.7` |

**Recommended models:**

| Model | Notes |
|---|---|
| `gemini-2.0-flash` | Fast, free tier, recommended |
| `gemini-1.5-pro` | 1M context window |
| `gemini-1.5-flash` | Faster, cheaper than Pro |

Tool use: native (FunctionDeclaration format). Streaming: native.

---

## Mistral

**API key required.**

Get key: https://console.mistral.ai/api-keys/

Free tier: None (pay-per-token)

| Variable | Default |
|---|---|
| `MISTRAL_API_KEY` | Required |
| `MISTRAL_MODEL` | `mistral-large-latest` |
| `MISTRAL_BASE_URL` | `https://api.mistral.ai/v1` |
| `MISTRAL_TEMPERATURE` | `0.7` |

**Recommended models:**

| Model | Notes |
|---|---|
| `mistral-large-latest` | Most capable |
| `mistral-small-latest` | Cheaper, still capable |
| `codestral-latest` | Best for coding tasks |
| `open-mistral-nemo` | Open, fast |

Tool use: native. Streaming: native fetch SSE (no SDK dependency).

---

## LM Studio (local)

**No API key required.**

Download: https://lmstudio.ai

| Variable | Default |
|---|---|
| `LMSTUDIO_BASE_URL` | `http://localhost:1234/v1` |
| `LMSTUDIO_MODEL` | `local-model` |
| `LMSTUDIO_TEMPERATURE` | `0.7` |

Load any GGUF model in LM Studio, start the local server, then run PersonalAI.

Tool use: not supported (LM Studio's OpenAI-compatible server does not relay function calls).

---

## Together.ai

**Free credit on signup.**

Get key: https://api.together.xyz/settings/api-keys

Free tier: $1 credit on signup (~1M tokens on Llama 3.3 70B)

| Variable | Default |
|---|---|
| `TOGETHER_API_KEY` | Required |
| `TOGETHER_MODEL` | `meta-llama/Llama-3.3-70B-Instruct-Turbo` |
| `TOGETHER_TEMPERATURE` | `0.7` |

**Recommended models:**

| Model | Notes |
|---|---|
| `meta-llama/Llama-3.3-70B-Instruct-Turbo` | Best quality, recommended |
| `meta-llama/Llama-3.2-11B-Vision-Instruct-Turbo` | Multimodal |
| `mistralai/Mixtral-8x7B-Instruct-v0.1` | Long context |
| `Qwen/Qwen2.5-72B-Instruct-Turbo` | Strong reasoning |

Tool use: not supported in this integration. Streaming: native.

---

## Switching Providers

```bash
# In .env:
PROVIDER=groq
GROQ_API_KEY=gsk_...

# Or at runtime (restart required):
PROVIDER=anthropic npm start
```

ModelManager only activates for Ollama (it manages qwen2.5 vs gemma3 routing). For API providers, the single configured model is used for all tasks.
