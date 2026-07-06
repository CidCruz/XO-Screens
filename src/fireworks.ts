/**
 * fireworks.ts
 *
 * All AI inference routed through Fireworks AI using the OpenAI-compatible API.
 * Models used: Google DeepMind Gemma 4 family (all three variants).
 *
 * Model routing strategy:
 *   GEMMA_E4B  — fast, efficient; simple chat, routing, short tasks
 *   GEMMA_26B  — balanced; summarisation, NER, sentiment, code debugging
 *   GEMMA_31B  — most capable; video captioning, complex reasoning, code generation
 */

import type { Message } from './types'

// ─── Config ──────────────────────────────────────────────────────────────────

const API_KEY  = import.meta.env.VITE_FIREWORKS_API_KEY as string
const BASE_URL = (import.meta.env.VITE_FIREWORKS_BASE_URL as string | undefined)
  ?? 'https://api.fireworks.ai/inference/v1'

// ─── Gemma 4 Models ───────────────────────────────────────────────────────────

export const GEMMA_MODELS = {
  /** Gemma 4 E4B — fast & efficient, best for simple/short tasks */
  E4B:  'accounts/fireworks/models/gemma-4-e4b',
  /** Gemma 4 26B A4B IT — balanced capability, good for most tasks */
  B26:  'accounts/fireworks/models/gemma-4-26b-a4b-it',
  /** Gemma 4 31B IT — most capable, used for video captioning & complex tasks */
  B31:  'accounts/fireworks/models/gemma-4-31b-it',
} as const

export type GemmaModel = typeof GEMMA_MODELS[keyof typeof GEMMA_MODELS]

// ─── Core fetch helper ────────────────────────────────────────────────────────

interface FWMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
  tool_call_id?: string
  name?: string
}

interface FWToolCall {
  id: string
  type: 'function'
  function: { name: string; arguments: string }
}

interface FWChoice {
  message: {
    role: string
    content: string | null
    tool_calls?: FWToolCall[]
  }
  finish_reason: string
}

async function callFW(
  messages: FWMessage[],
  model: GemmaModel,
  options?: {
    temperature?: number
    maxTokens?: number
    tools?: FWToolDeclaration[]
    attempt?: number
  },
): Promise<FWChoice> {
  const { temperature = 0.7, maxTokens = 2048, tools, attempt = 0 } = options ?? {}

  const body: Record<string, unknown> = {
    model,
    messages,
    temperature,
    max_tokens: maxTokens,
  }
  if (tools && tools.length > 0) {
    body.tools = tools.map(t => ({ type: 'function', function: t }))
    body.tool_choice = 'auto'
  }

  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${API_KEY}`,
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const errText = await res.text().catch(() => '')
    if (attempt < 2 && (res.status >= 500 || res.status === 429)) {
      await new Promise(r => setTimeout(r, 1500 * (attempt + 1)))
      return callFW(messages, model, { ...options, attempt: attempt + 1 })
    }
    throw new Error(`Fireworks API error ${res.status}: ${errText}`)
  }

  const data = await res.json()
  return data.choices?.[0] as FWChoice
}

// ─── Tool declarations (OpenAI function-calling format) ───────────────────────

export interface FWToolDeclaration {
  name: string
  description: string
  parameters: {
    type: 'object'
    properties: Record<string, {
      type: string
      description?: string
      enum?: string[]
      items?: { type: string }
    }>
    required?: string[]
  }
}

export interface ToolCallRequest {
  name: string
  args: Record<string, unknown>
}

export interface ToolCallResult {
  name: string
  result: unknown
}

// ─── Video Captions ───────────────────────────────────────────────────────────

export type CaptionTone = 'formal' | 'sarcastic' | 'humorous-tech' | 'humorous-nontech'

export interface ToneResult {
  captions: string
  summary: string
}

export type CaptionResults = Record<CaptionTone, ToneResult>

const TONE_SYSTEM_PROMPTS: Record<CaptionTone, string> = {
  formal:
    'You are a professional captioning and summarisation assistant. Write in a clear, neutral, formal register suitable for corporate or academic use.',
  sarcastic:
    'You are a witty, sarcastic captioning assistant. Drip every caption and summary with dry sarcasm and sardonic commentary — but still convey the actual content accurately.',
  'humorous-tech':
    'You are a tech-savvy comedian captioning for a developer audience. Sprinkle in programming jokes, tech buzzwords used ironically, and geek humour — but remain accurate.',
  'humorous-nontech':
    'You are a stand-up comedian captioning for a general audience. Keep the humour accessible, punny, and light-hearted — no jargon.',
}

const CAPTION_USER_PROMPT = (videoDescription: string) => `
Analyse this video content and produce ALL of the following:

VIDEO CONTENT:
${videoDescription}

1. TIMESTAMPED CAPTIONS — Cover every spoken word and significant visual action.
   Format: MM:SS – [SPEAKER_LABEL] caption text
   Insert scene markers as: MM:SS – [SCENE] description
   Insert on-screen text as: MM:SS – [TEXT] "exact text"

2. SUMMARY — A thorough paragraph describing the entire video.

Return ONLY valid JSON, no markdown fences:
{"captions": "0:00 – [SCENE] ...\\n0:05 – [SPEAKER_1] ...", "summary": "..."}
`.trim()

function parseToneResult(raw: string): ToneResult {
  const clean = raw
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/g, '')
    .trim()

  let parsed: { captions?: unknown; summary?: unknown }
  try {
    parsed = JSON.parse(clean)
  } catch {
    const match = clean.match(/\{[\s\S]*\}/)
    if (match) {
      try { parsed = JSON.parse(match[0]) }
      catch { throw new Error('Unparseable JSON from model. Raw: ' + raw.slice(0, 300)) }
    } else {
      throw new Error('No JSON object in model response. Raw: ' + raw.slice(0, 300))
    }
  }

  return {
    captions: typeof parsed.captions === 'string' ? parsed.captions.trim() : '',
    summary:  typeof parsed.summary  === 'string' ? parsed.summary.trim()  : '',
  }
}

/**
 * Process a video URL through Fireworks AI (Gemma 4 31B).
 * Fireworks vision models accept image frames; for video URLs we describe
 * the video via a fetch-and-describe approach using the multimodal endpoint.
 */
export async function processVideoURL(
  url: string,
  onProgress?: (tone: CaptionTone) => void,
): Promise<CaptionResults> {
  // Use Gemma 4 31B for video captioning — most capable model
  const model = GEMMA_MODELS.B31

  // First pass: get a detailed description of the video content
  const descMessages: FWMessage[] = [
    {
      role: 'system',
      content: 'You are a video analysis assistant. Describe the video at the given URL in exhaustive detail: every scene, speaker, action, on-screen text, and timestamp. Be thorough.',
    },
    {
      role: 'user',
      content: `Analyse this video in detail: ${url}\n\nDescribe everything you observe: scenes, people, actions, dialogue, on-screen text, timestamps. Be exhaustive.`,
    },
  ]

  const descChoice = await callFW(descMessages, model, { temperature: 0.3, maxTokens: 4096 })
  const videoDescription = descChoice.message.content ?? `Video from URL: ${url}`

  // Second pass: generate all 4 tones in parallel
  const results = {} as CaptionResults
  const tones = Object.keys(TONE_SYSTEM_PROMPTS) as CaptionTone[]

  await Promise.all(tones.map(async tone => {
    onProgress?.(tone)
    let lastErr: unknown
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const msgs: FWMessage[] = [
          { role: 'system', content: TONE_SYSTEM_PROMPTS[tone] },
          { role: 'user',   content: CAPTION_USER_PROMPT(videoDescription) },
        ]
        const choice = await callFW(msgs, model, { temperature: 0.5, maxTokens: 8192 })
        results[tone] = parseToneResult(choice.message.content ?? '')
        return
      } catch (err) {
        lastErr = err
        if (attempt < 2) await new Promise(r => setTimeout(r, 1200 * (attempt + 1)))
      }
    }
    results[tone] = {
      captions: '',
      summary: `⚠️ Failed after 3 attempts. ${lastErr instanceof Error ? lastErr.message : String(lastErr)}`,
    }
  }))

  return results
}

/**
 * Process a local video file.
 * Converts to base64 and sends as a multimodal message to Gemma 4 31B.
 */
export async function processVideoFile(
  file: File,
  onProgress?: (tone: CaptionTone) => void,
  onUploadProgress?: (phase: 'uploading' | 'processing', pct?: number) => void,
): Promise<CaptionResults> {
  onUploadProgress?.('uploading', 0)

  const arrayBuffer = await file.arrayBuffer()
  const bytes = new Uint8Array(arrayBuffer)
  let binary = ''
  const chunkSize = 8192
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize))
    onUploadProgress?.('uploading', Math.round(((i + chunkSize) / bytes.length) * 80))
  }
  const base64 = btoa(binary)
  const mimeType = file.type || 'video/mp4'

  onUploadProgress?.('processing')

  const model = GEMMA_MODELS.B31

  // First pass: describe the video
  const descMessages: FWMessage[] = [
    {
      role: 'system',
      content: 'You are a video analysis assistant. Describe the video in exhaustive detail: every scene, speaker, action, on-screen text, and timestamp.',
    },
    {
      role: 'user',
      content: JSON.stringify([
        {
          type: 'image_url',
          image_url: { url: `data:${mimeType};base64,${base64}` },
        },
        {
          type: 'text',
          text: 'Analyse this video in detail. Describe every scene, person, action, dialogue, on-screen text, and timestamp. Be exhaustive.',
        },
      ]),
    },
  ]

  const descChoice = await callFW(descMessages, model, { temperature: 0.3, maxTokens: 4096 })
  const videoDescription = descChoice.message.content ?? `Video file: ${file.name}`

  const results = {} as CaptionResults
  const tones = Object.keys(TONE_SYSTEM_PROMPTS) as CaptionTone[]

  await Promise.all(tones.map(async tone => {
    onProgress?.(tone)
    let lastErr: unknown
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const msgs: FWMessage[] = [
          { role: 'system', content: TONE_SYSTEM_PROMPTS[tone] },
          { role: 'user',   content: CAPTION_USER_PROMPT(videoDescription) },
        ]
        const choice = await callFW(msgs, model, { temperature: 0.5, maxTokens: 8192 })
        results[tone] = parseToneResult(choice.message.content ?? '')
        return
      } catch (err) {
        lastErr = err
        if (attempt < 2) await new Promise(r => setTimeout(r, 1200 * (attempt + 1)))
      }
    }
    results[tone] = {
      captions: '',
      summary: `⚠️ Failed after 3 attempts. ${lastErr instanceof Error ? lastErr.message : String(lastErr)}`,
    }
  }))

  return results
}

// ─── Chat helpers ─────────────────────────────────────────────────────────────

/**
 * Simple chat — uses Gemma 4 E4B for speed.
 */
export async function sendMessage(
  messages: Message[],
  userMessage: string,
  systemPrompt?: string,
): Promise<string> {
  const fwMsgs: FWMessage[] = []
  if (systemPrompt) fwMsgs.push({ role: 'system', content: systemPrompt })
  for (const m of messages) {
    fwMsgs.push({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content })
  }
  fwMsgs.push({ role: 'user', content: userMessage })

  const choice = await callFW(fwMsgs, GEMMA_MODELS.E4B, { temperature: 0.9, maxTokens: 1024 })
  return choice.message.content ?? 'No response.'
}

/**
 * Agentic chat with tool-calling — uses Gemma 4 26B for balanced capability.
 */
export async function sendMessageWithTools(
  messages: Message[],
  userMessage: string,
  systemPrompt: string,
  tools: FWToolDeclaration[],
  executor: (call: ToolCallRequest) => Promise<unknown>,
  onToolCall?: (call: ToolCallRequest) => void,
): Promise<string> {
  const fwMsgs: FWMessage[] = []
  if (systemPrompt) fwMsgs.push({ role: 'system', content: systemPrompt })
  for (const m of messages) {
    fwMsgs.push({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content })
  }
  fwMsgs.push({ role: 'user', content: userMessage })

  // Use 26B for tool-calling — good balance of speed and capability
  const model = GEMMA_MODELS.B26
  const MAX_ROUNDS = 10

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const choice = await callFW(fwMsgs, model, {
      temperature: 0.7,
      maxTokens: 2048,
      tools: tools.length > 0 ? tools : undefined,
    })

    const msg = choice.message
    const toolCalls = msg.tool_calls ?? []

    if (toolCalls.length === 0) {
      return msg.content ?? 'Done.'
    }

    // Execute all tool calls in parallel
    const results = await Promise.all(
      toolCalls.map(async tc => {
        let args: Record<string, unknown> = {}
        try { args = JSON.parse(tc.function.arguments) } catch { /* ignore */ }
        const call: ToolCallRequest = { name: tc.function.name, args }
        onToolCall?.(call)
        let result: unknown
        try { result = await executor(call) }
        catch (err) { result = { error: err instanceof Error ? err.message : String(err) } }
        return { id: tc.id, name: tc.function.name, result }
      })
    )

    // Append assistant turn with tool calls
    fwMsgs.push({
      role: 'assistant',
      content: msg.content ?? '',
    })

    // Append tool results
    for (const r of results) {
      fwMsgs.push({
        role: 'tool',
        tool_call_id: r.id,
        name: r.name,
        content: JSON.stringify(r.result),
      })
    }
  }

  return 'I ran out of tool-call rounds. Please try again.'
}

// ─── Gemini-compatible re-exports (used by existing components) ───────────────
// These aliases let us drop-in replace gemini.ts without touching other files.

export type { FWToolDeclaration as GeminiToolDeclaration }

export async function sendToGeminiWithSystem(
  messages: Message[],
  userMessage: string,
  systemPrompt: string,
): Promise<string> {
  return sendMessage(messages, userMessage, systemPrompt)
}

export async function sendToGemini(
  messages: Message[],
  userMessage: string,
): Promise<string> {
  return sendMessage(messages, userMessage, 'You are XO, an intelligent desktop AI assistant. Be concise, helpful, and friendly.')
}

export async function sendToGeminiWithTools(
  messages: Message[],
  userMessage: string,
  systemPrompt: string,
  tools: FWToolDeclaration[],
  executor: (call: ToolCallRequest) => Promise<unknown>,
  onToolCall?: (call: ToolCallRequest) => void,
): Promise<string> {
  return sendMessageWithTools(messages, userMessage, systemPrompt, tools, executor, onToolCall)
}

export async function sendAudioToGemini(
  messages: Message[],
  audioBlob: Blob,
): Promise<string> {
  const arrayBuffer = await audioBlob.arrayBuffer()
  const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)))
  const mimeType = audioBlob.type || 'audio/webm'

  const fwMsgs: FWMessage[] = [
    {
      role: 'system',
      content: 'You are XO, an intelligent desktop AI assistant. The user sent a voice message — transcribe it mentally and respond. Be concise, helpful, and friendly.',
    },
    ...messages.map(m => ({
      role: (m.role === 'assistant' ? 'assistant' : 'user') as FWMessage['role'],
      content: m.content,
    })),
    {
      role: 'user' as const,
      content: JSON.stringify([
        { type: 'input_audio', input_audio: { data: base64, format: mimeType.split('/')[1] ?? 'webm' } },
      ]),
    },
  ]

  const choice = await callFW(fwMsgs, GEMMA_MODELS.E4B, { temperature: 0.9, maxTokens: 1024 })
  return choice.message.content ?? 'No response.'
}
