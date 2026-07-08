/**
 * fireworks.ts
 *
 * All AI inference routed through Fireworks AI using the OpenAI-compatible API.
 *
 * Model routing strategy:
 *   CHAT   (deepseek-v4-pro)  — all text chat, tool-calling, reasoning
 *   VISION (qwen3p7-plus)     — video captioning, multimodal tasks
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
  const { temperature = 0.7, maxTokens, tools, attempt = 0 } = options ?? {}

  const body: Record<string, unknown> = {
    model,
    messages,
    temperature,
  }
  if (maxTokens !== undefined) body.max_tokens = maxTokens
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

Write timestamped captions and a summary for this video in your assigned tone. Base everything strictly on the description above.

You MUST respond with a single raw JSON object and nothing else. No markdown, no code fences, no explanation, no thinking.
The JSON must have exactly these two keys:
- "captions": a string containing 4-6 timestamped lines, each formatted exactly as "0:00 – caption text here", separated by newlines.
- "summary": a string containing one paragraph summarising the entire video in your assigned tone.

Both "captions" and "summary" MUST be non-empty strings. Start your response with { and end with }. /no_think`

function parseToneResult(raw: string): ToneResult | null {
  const stripped = raw
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/^```json\s*/im, '')
    .replace(/^```\s*/im, '')
    .replace(/```\s*$/gm, '')
    .trim()

  const jsonMatch = stripped.match(/\{[\s\S]*\}/)
  if (!jsonMatch) return null

  let parsed: { captions?: unknown; summary?: unknown } = {}
  try {
    parsed = JSON.parse(jsonMatch[0].trim())
  } catch {
    // Salvage truncated JSON by extracting fields with regex
    const captionsMatch = jsonMatch[0].match(/"captions"\s*:\s*"((?:[^"\\]|\\.)*)"/s)
    const summaryMatch  = jsonMatch[0].match(/"summary"\s*:\s*"((?:[^"\\]|\\.)*)"/s)
    if (captionsMatch) parsed.captions = captionsMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"')
    if (summaryMatch)  parsed.summary  = summaryMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"')
  }

  const isValid = (s: unknown) =>
    typeof s === 'string' && s.trim().length >= 10 &&
    s.trim() !== 'CAPTION_TEXT' && s.trim() !== 'SUMMARY_TEXT'

  if (!isValid(parsed.summary)) return null

  return {
    captions: isValid(parsed.captions) ? (parsed.captions as string).trim() : '',
    summary: (parsed.summary as string).trim(),
  }
}

// ─── Shared caption pass ──────────────────────────────────────────────────────

async function runCaptionPass(
  videoDescription: string,
  onProgress?: (tone: CaptionTone) => void,
): Promise<CaptionResults> {
  const results = {} as CaptionResults
  const tones = Object.keys(TONE_SYSTEM_PROMPTS) as CaptionTone[]

  await Promise.all(tones.map(async tone => {
    let lastErr: unknown
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        const msgs: FWMessage[] = [
          { role: 'system', content: TONE_SYSTEM_PROMPTS[tone] },
          { role: 'user', content: CAPTION_USER_PROMPT(videoDescription) },
        ]
        const choice = await callFW(msgs, GEMMA_MODELS.E4B, { temperature: 0.7 })
        const parsed = parseToneResult(choice.message.content ?? '')
        if (parsed) {
          results[tone] = parsed
          onProgress?.(tone)
          return
        }
        lastErr = new Error('Empty or unparseable response')
      } catch (err) {
        lastErr = err
      }
      if (attempt < 3) await new Promise(r => setTimeout(r, 1200 * (attempt + 1)))
    }
    results[tone] = {
      captions: '',
      summary: `Failed to generate summary. ${lastErr instanceof Error ? lastErr.message : String(lastErr)}`,
    }
    onProgress?.(tone)
  }))

  return results
}

// ─── Frame capture helpers ────────────────────────────────────────────────────

async function captureFrames(video: HTMLVideoElement, nFrames: number): Promise<string[]> {
  const canvas = document.createElement('canvas')
  canvas.width = 320
  canvas.height = Math.round(320 * (video.videoHeight / video.videoWidth))
  const ctx = canvas.getContext('2d')!

  let duration = video.duration
  if (!isFinite(duration) || duration <= 0) {
    await new Promise<void>(res => {
      const onSeeked = () => { video.removeEventListener('seeked', onSeeked); res() }
      video.addEventListener('seeked', onSeeked)
      video.currentTime = 1e9
    })
    duration = video.duration
  }
  if (!isFinite(duration) || duration <= 0) duration = 30

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

async function extractFrames(file: File, nFrames = 8): Promise<string[]> {
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

const DESC_SYSTEM = 'You are a video analysis assistant. Describe the video frames in detail: the exact setting/location, every subject visible (people, animals, objects), what actions are occurring, any text on screen, and the overall mood. Be thorough and specific. Output plain prose only — no markdown, no code, no JSON, no thinking. /no_think'
const DESC_USER   = 'These are evenly-spaced frames from a video clip. Describe in detail what is happening throughout the video. Plain prose only. /no_think'

// ─── Public API ───────────────────────────────────────────────────────────────

export async function processVideoURL(
  url: string,
  onProgress?: (tone: CaptionTone) => void,
): Promise<CaptionResults> {
  const proxyUrl = `/api/video-proxy?url=${encodeURIComponent(url)}`
  const res = await fetch(proxyUrl)
  if (res.status === 400) throw new Error('Not a valid URL.')
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
        captureFrames(video, 8).then(resolve).catch(reject)
      })
    })
  } finally {
    URL.revokeObjectURL(objectUrl)
  }

  if (frameDataUrls.length === 0) throw new Error('Could not extract frames from video.')

  const descChoice = await callFW([
    { role: 'system', content: DESC_SYSTEM },
    { role: 'user', content: [
      ...frameDataUrls.map(u => ({ type: 'image_url' as const, image_url: { url: u } })),
      { type: 'text' as const, text: DESC_USER },
    ]},
  ], GEMMA_MODELS.B31, { temperature: 0.3 })

  const videoDescription = (descChoice.message.content ?? '')
    .replace(/<think>[\s\S]*?<\/think>/gi, '').trim() || `Video from URL: ${url}`

  return runCaptionPass(videoDescription, onProgress)
}

export async function processVideoFile(
  file: File,
  onProgress?: (tone: CaptionTone) => void,
  onUploadProgress?: (phase: 'uploading' | 'processing', pct?: number) => void,
): Promise<CaptionResults> {
  onUploadProgress?.('uploading', 10)

  const frameDataUrls = await extractFrames(file, 8)
  if (frameDataUrls.length === 0) throw new Error('Could not extract frames from video.')

  onUploadProgress?.('processing')

  const descChoice = await callFW([
    { role: 'system', content: DESC_SYSTEM },
    { role: 'user', content: [
      ...frameDataUrls.map(url => ({ type: 'image_url' as const, image_url: { url } })),
      { type: 'text' as const, text: DESC_USER },
    ]},
  ], GEMMA_MODELS.B31, { temperature: 0.3 })

  const videoDescription = (descChoice.message.content ?? '')
    .replace(/<think>[\s\S]*?<\/think>/gi, '').trim() || `Video file: ${file.name}`

  return runCaptionPass(videoDescription, onProgress)
}

// ─── Chat helpers ─────────────────────────────────────────────────────────────

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

  const choice = await callFW(fwMsgs, GEMMA_MODELS.E4B, { temperature: 0.9 })
  return choice.message.content ?? 'No response.'
}

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

  const model = GEMMA_MODELS.B26
  const MAX_ROUNDS = 10

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const choice = await callFW(fwMsgs, model, {
      temperature: 0.7,
      tools: tools.length > 0 ? tools : undefined,
    })

    const msg = choice.message
    const toolCalls = msg.tool_calls ?? []

    if (toolCalls.length === 0) return msg.content ?? 'Done.'

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

    fwMsgs.push({ role: 'assistant', content: msg.content ?? '' })
    for (const r of results) {
      fwMsgs.push({ role: 'tool', tool_call_id: r.id, name: r.name, content: JSON.stringify(r.result) })
    }
  }

  return 'I ran out of tool-call rounds. Please try again.'
}

// ─── Gemini-compatible re-exports ─────────────────────────────────────────────

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

  const choice = await callFW(fwMsgs, GEMMA_MODELS.E4B, { temperature: 0.9 })
  return choice.message.content ?? 'No response.'
}
