/**
 * fireworks.ts
 *
 * All AI inference routed through Fireworks AI using the OpenAI-compatible API.
 *
 * Model routing strategy:
 *   CHAT   (deepseek-v4-pro)  — all text chat, tool-calling, reasoning
 *   VISION (kimi-k2p6)        — video captioning, multimodal tasks
 *
 * GEMMA_MODELS aliases kept for backward compatibility with existing imports.
 */

import type { Message } from './types'

// ─── Config ──────────────────────────────────────────────────────────────────

const API_KEY  = import.meta.env.VITE_FIREWORKS_API_KEY as string
const BASE_URL = (import.meta.env.VITE_FIREWORKS_BASE_URL as string | undefined)
  ?? 'https://api.fireworks.ai/inference/v1'

// ─── Available Models ─────────────────────────────────────────────────────────

export const FW_MODELS = {
  /** DeepSeek V4 Pro — best for chat, reasoning, tool-calling */
  CHAT:   'accounts/fireworks/models/deepseek-v4-pro',
  /** Qwen3 Plus — vision-capable, non-reasoning, used for video captions */
  VISION: 'accounts/fireworks/models/qwen3p7-plus',
} as const

// Legacy aliases so nothing else in the codebase breaks
export const GEMMA_MODELS = {
  E4B: FW_MODELS.CHAT,
  B26: FW_MODELS.CHAT,
  B31: FW_MODELS.VISION,
} as const

export type GemmaModel = typeof FW_MODELS[keyof typeof FW_MODELS]

// ─── Core fetch helper ────────────────────────────────────────────────────────

type FWContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } }

interface FWMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | FWContentPart[]
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
    'You are a professional video captioning assistant. Write in a clear, neutral, formal register. Be precise and factual about what is actually shown in the video. /no_think',
  sarcastic:
    'You are a witty, sarcastic video captioning assistant. Use dry sarcasm and sardonic commentary — but you MUST accurately describe what is actually happening in the video. /no_think',
  'humorous-tech':
    'You are a tech-savvy comedian captioning videos for developers. Use programming jokes and geek humour — but you MUST accurately describe what is actually shown in the video. /no_think',
  'humorous-nontech':
    'You are a stand-up comedian captioning videos for a general audience. Keep it punny and light-hearted, no jargon — but you MUST accurately describe what is actually shown in the video. /no_think',
}

const CAPTION_USER_PROMPT = (videoDescription: string) => `Video description:
${videoDescription}

Write captions and a summary for this video in your assigned tone. Base everything strictly on the description above.

Output a single raw JSON object with exactly two keys:
- "captions": 2-3 sentences describing the video
- "summary": one paragraph summarising the video

No markdown, no code fences, no explanation. Start your response with { and end with }. /no_think`

function parseToneResult(raw: string): ToneResult {
  // Strip think blocks and fences, then grab the outermost { ... } (greedy — handles values with braces)
  const stripped = raw
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/g, '')
    .trim()

  // Greedy match: from first { to last }
  const jsonMatch = stripped.match(/\{[\s\S]*\}/)
  const clean = jsonMatch ? jsonMatch[0].trim() : stripped

  let parsed: { captions?: unknown; summary?: unknown } = {}
  try {
    parsed = JSON.parse(clean)
  } catch { /* fall through — parsed stays {} */ }

  const isPlaceholder = (s: unknown) =>
    typeof s !== 'string' || s.trim().length < 5 ||
    s.trim() === 'CAPTION_TEXT' || s.trim() === 'SUMMARY_TEXT'

  return {
    captions: isPlaceholder(parsed.captions) ? '' : (parsed.captions as string).trim(),
    summary: isPlaceholder(parsed.summary) ? clean : (parsed.summary as string).trim(),
  }
}

/**
 * Extract N evenly-spaced frames from a video URL using canvas.
 */
/**
 * Process a video URL — extracts frames via canvas, sends only those to the API.
 */
export async function processVideoURL(
  url: string,
  onProgress?: (tone: CaptionTone) => void,
): Promise<CaptionResults> {
  const model = GEMMA_MODELS.B31

  // Fetch via local dev proxy to bypass CORS, then extract frames client-side
  const proxyUrl = `/api/video-proxy?url=${encodeURIComponent(url)}`
  const res = await fetch(proxyUrl)
  if (!res.ok) throw new Error(`Failed to fetch video: ${res.status}`)
  const blob = await res.blob()
  const objectUrl = URL.createObjectURL(blob)

  let frameDataUrls: string[]
  try {
    frameDataUrls = await new Promise<string[]>((resolve, reject) => {
      const video = document.createElement('video')
      video.preload = 'metadata'
      video.muted = true
      video.playsInline = true
      video.src = objectUrl
      video.addEventListener('error', () => reject(new Error('Video load failed')))
      video.addEventListener('loadedmetadata', () => {
        captureFrames(video, 6).then(resolve).catch(reject)
      })
    })
  } finally {
    URL.revokeObjectURL(objectUrl)
  }

  if (frameDataUrls.length === 0) throw new Error('Could not extract frames from video.')

  const frameParts = frameDataUrls.map(u => ({
    type: 'image_url' as const,
    image_url: { url: u },
  }))

  const descMessages: FWMessage[] = [
    {
      role: 'system',
      content: 'You are a video analysis assistant. Describe the video frames in detail: the exact setting/location, every subject visible (people, animals, objects), what actions are occurring, any text on screen, and the overall mood. Be thorough and specific — your description will be used to generate captions. /no_think',
    },
    {
      role: 'user',
      content: [
        ...frameParts,
        { type: 'text', text: 'These are evenly-spaced frames from a video clip. Describe in detail what is happening throughout the video.' },
      ] as FWMessage['content'],
    },
  ]

  const descChoice = await callFW(descMessages, model, { temperature: 0.3, maxTokens: 600 })
  const videoDescription = descChoice.message.content?.trim() ?? `Video from URL: ${url}`

  const results = {} as CaptionResults
  const tones = Object.keys(TONE_SYSTEM_PROMPTS) as CaptionTone[]

  // Caption pass: text only — use CHAT model (no vision needed, avoids reasoning bleed)
  await Promise.all(tones.map(async tone => {
    onProgress?.(tone)
    let lastErr: unknown
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const msgs: FWMessage[] = [
          { role: 'system', content: TONE_SYSTEM_PROMPTS[tone] },
          { role: 'user', content: CAPTION_USER_PROMPT(videoDescription) },
        ]
        const choice = await callFW(msgs, GEMMA_MODELS.E4B, { temperature: 0.7, maxTokens: 1024 })
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
 * Extract N evenly-spaced frames from a video File using canvas.
 */
async function captureFrames(video: HTMLVideoElement, nFrames: number): Promise<string[]> {
  const canvas = document.createElement('canvas')
  canvas.width = 320
  canvas.height = Math.round(320 * (video.videoHeight / video.videoWidth))
  const ctx = canvas.getContext('2d')!

  // For streaming URLs, duration may be Infinity — force a seek to load it
  let duration = video.duration
  if (!isFinite(duration) || duration <= 0) {
    // Seek to a large number to force the browser to buffer and reveal duration
    await new Promise<void>(res => {
      const onSeeked = () => { video.removeEventListener('seeked', onSeeked); res() }
      video.addEventListener('seeked', onSeeked)
      video.currentTime = 1e9
    })
    duration = video.duration
  }
  if (!isFinite(duration) || duration <= 0) duration = 30 // last resort fallback

  const interval = duration / (nFrames + 1)
  const timestamps = Array.from({ length: nFrames }, (_, i) => interval * (i + 1))
  const frames: string[] = []

  for (const ts of timestamps) {
    await new Promise<void>(res => {
      const onSeeked = () => { video.removeEventListener('seeked', onSeeked); res() }
      video.addEventListener('seeked', onSeeked)
      video.currentTime = ts
    })
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    frames.push(canvas.toDataURL('image/jpeg', 0.6))
  }

  return frames
}

async function extractFrames(file: File, nFrames = 5): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const video = document.createElement('video')
    video.preload = 'metadata'
    video.muted = true
    video.playsInline = true
    video.src = url
    video.addEventListener('error', () => { URL.revokeObjectURL(url); reject(new Error('Video load failed')) })
    video.addEventListener('loadedmetadata', () => {
      captureFrames(video, nFrames)
        .then(frames => { URL.revokeObjectURL(url); resolve(frames) })
        .catch(err => { URL.revokeObjectURL(url); reject(err) })
    })
  })
}

/**
 * Process a local video file.
 * Extracts frames via canvas (no ffmpeg needed) and sends only those to the API.
 */
export async function processVideoFile(
  file: File,
  onProgress?: (tone: CaptionTone) => void,
  onUploadProgress?: (phase: 'uploading' | 'processing', pct?: number) => void,
): Promise<CaptionResults> {
  onUploadProgress?.('uploading', 10)

  // Extract frames client-side — avoids sending the entire video as base64
  const frameDataUrls = await extractFrames(file, 6)
  if (frameDataUrls.length === 0) throw new Error('Could not extract frames from video.')

  onUploadProgress?.('processing')

  const model = GEMMA_MODELS.B31

  const frameParts = frameDataUrls.map(url => ({
    type: 'image_url' as const,
    image_url: { url },
  }))

  // First pass: describe the video from frames (frames sent ONCE only)
  const descMessages: FWMessage[] = [
    {
      role: 'system',
      content: 'You are a video analysis assistant. Describe the video frames in detail: the exact setting/location, every subject visible (people, animals, objects), what actions are occurring, any text on screen, and the overall mood. Be thorough and specific — your description will be used to generate captions. /no_think',
    },
    {
      role: 'user',
      content: [
        ...frameParts,
        { type: 'text', text: 'These are evenly-spaced frames from a video clip. Describe in detail what is happening throughout the video.' },
      ] as FWMessage['content'],
    },
  ]

  const descChoice = await callFW(descMessages, model, { temperature: 0.3, maxTokens: 600 })
  const videoDescription = descChoice.message.content?.trim() ?? `Video file: ${file.name}`

  const results = {} as CaptionResults
  const tones = Object.keys(TONE_SYSTEM_PROMPTS) as CaptionTone[]

  // Caption pass: text only — use CHAT model (no vision needed, avoids reasoning bleed)
  await Promise.all(tones.map(async tone => {
    onProgress?.(tone)
    let lastErr: unknown
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const msgs: FWMessage[] = [
          { role: 'system', content: TONE_SYSTEM_PROMPTS[tone] },
          { role: 'user', content: CAPTION_USER_PROMPT(videoDescription) },
        ]
        const choice = await callFW(msgs, GEMMA_MODELS.E4B, { temperature: 0.7, maxTokens: 1024 })
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

  // Use chat model for tool-calling
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
