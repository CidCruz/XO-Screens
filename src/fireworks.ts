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

const BASE_URL = (import.meta.env.VITE_FIREWORKS_BASE_URL as string | undefined)
  ?? 'https://api.fireworks.ai/inference/v1'

export const BYOK_STORAGE_KEY = 'xo-fireworks-api-key'

function getApiKey(): string {
  return localStorage.getItem(BYOK_STORAGE_KEY)
    || (import.meta.env.VITE_FIREWORKS_API_KEY as string | undefined)
    || ''
}

// ─── Available Models ─────────────────────────────────────────────────────────

export const FW_MODELS = {
  /** DeepSeek V4 Pro — best for chat, reasoning, tool-calling */
  CHAT:   'accounts/fireworks/models/deepseek-v4-pro',
  /** Minimax M3 — native multimodal vision, used for video frame analysis */
  VISION: 'accounts/fireworks/models/minimax-m3',
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
      'Authorization': `Bearer ${getApiKey()}`,
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const errText = await res.text().catch(() => '')
    if (res.status === 401) {
      throw new Error('You haven\'t set up your Fireworks API key yet. Go to Settings → paste your key from fireworks.ai')
    }
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

// Underscore variants match the Track 2 spec and agent.py exactly
export type CaptionTone = 'formal' | 'sarcastic' | 'humorous_tech' | 'humorous_non_tech'

export interface ToneResult {
  summary: string
}

export interface CaptionResults {
  formal: ToneResult
  sarcastic: ToneResult
  humorous_tech: ToneResult
  humorous_non_tech: ToneResult
}

const TONE_SYSTEM_PROMPTS: Record<CaptionTone, string> = {
  formal:
    'You are a BBC documentary narrator writing professional video captions. Write in active voice, present tense. One establishing sentence (setting/who), then a sequence of what happens. NO bullet points. NO dramatic flourishes. Just precise, authoritative narration. /no_think',
  sarcastic:
    'You are a sarcastic narrator who loves pointing out the obvious with bone-dry wit. Use ironic understatement, subtle eye-rolls, and pointed commentary. FORBIDDEN: exclamation marks. REQUIRED: at least one moment where you imply the viewer already knows this is absurd. Stay accurate to the video but make every sentence land with a smirk. /no_think',
  humorous_tech:
    'You are a developer doing live commentary on a video for your tech Twitch stream. Sprinkle in: git merge conflicts, "works on my machine", Stack Overflow references, NullPointerExceptions, "it\'s a feature not a bug", code review memes. Keep it accurate but frame everything through a programmer\'s lens. /no_think',
  humorous_non_tech:
    'You\'re doing stand-up crowd work and the video is your heckler. Punny, observational, accessible humor — NO jargon. Channel the energy of "so THAT happened" or "well this is a vibe". Punch UP the absurdity, keep it light. Your audience is general, not technical. /no_think',
}

const SUMMARY_USER_PROMPT = (videoDescription: string) => `Video description:
${videoDescription}

Write a caption (2–3 sentences) for this video in your assigned tone.

You MUST respond with a single raw JSON object and nothing else. No markdown, no code fences, no explanation, no thinking.
The JSON must have exactly one key:
- "summary": a string containing 2–3 sentences summarising the video in your assigned tone.

Start your response with { and end with }. /no_think`

function parseToneResult(raw: string): ToneResult | null {
  const stripped = raw
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/^```json\s*/im, '')
    .replace(/^```\s*/im, '')
    .replace(/```\s*$/gm, '')
    .trim()

  const jsonMatch = stripped.match(/\{[\s\S]*\}/)
  if (!jsonMatch) return null

  let parsed: { summary?: unknown } = {}
  try {
    parsed = JSON.parse(jsonMatch[0].trim())
  } catch {
    const summaryMatch = jsonMatch[0].match(/"summary"\s*:\s*"((?:[^"\\]|\\.)*)"/s)
    if (summaryMatch) parsed.summary = summaryMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"')
  }

  const isValid = (s: unknown) =>
    typeof s === 'string' && s.trim().length >= 10 && s.trim() !== 'SUMMARY_TEXT'

  if (!isValid(parsed.summary)) return null
  return { summary: (parsed.summary as string).trim() }
}

// ─── Per-style temperatures (mirrors agent.py exactly) ────────────────────────
// formal: low temp = factual, consistent. humorous: high temp = creative, varied.
const STYLE_TEMPERATURES: Record<CaptionTone, number> = {
  formal:            0.15,
  sarcastic:         0.85,
  humorous_tech:     0.88,
  humorous_non_tech: 0.92,
}

// ─── Shared caption pass ──────────────────────────────────────────────────────

async function runCaptionPass(
  videoDescription: string,
  onProgress?: (tone: CaptionTone) => void,
): Promise<CaptionResults> {
  const toneResults = {} as Record<CaptionTone, ToneResult>
  const tones = Object.keys(TONE_SYSTEM_PROMPTS) as CaptionTone[]

  await Promise.all(tones.map(async tone => {
    const temperature = STYLE_TEMPERATURES[tone]
    let lastErr: unknown
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        const msgs: FWMessage[] = [
          { role: 'system', content: TONE_SYSTEM_PROMPTS[tone] },
          { role: 'user', content: SUMMARY_USER_PROMPT(videoDescription) },
        ]
        const choice = await callFW(msgs, GEMMA_MODELS.E4B, { temperature })
        const parsed = parseToneResult(choice.message.content ?? '')
        if (parsed) {
          toneResults[tone] = parsed
          onProgress?.(tone)
          return
        }
        lastErr = new Error('Empty or unparseable response')
      } catch (err) {
        lastErr = err
      }
      if (attempt < 3) await new Promise(r => setTimeout(r, 1200 * (attempt + 1)))
    }
    toneResults[tone] = {
      summary: `Failed to generate summary. ${lastErr instanceof Error ? lastErr.message : String(lastErr)}`,
    }
    onProgress?.(tone)
  }))

  return { ...toneResults } as CaptionResults
}

// ─── Frame capture helpers ────────────────────────────────────────────────────

async function captureFrames(video: HTMLVideoElement, nFrames: number): Promise<string[]> {
  const canvas = document.createElement('canvas')
  canvas.width = 480
  canvas.height = Math.round(480 * (video.videoHeight / video.videoWidth))
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

async function extractFrames(file: File, nFrames = 16): Promise<string[]> {
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

const DESC_SYSTEM = 'You are a video analysis assistant. Describe the video in detail: the exact setting/location, every subject visible (people, animals, objects), what actions are occurring in sequence from start to finish, any text on screen, and the overall mood. Be thorough and specific — treat the frames as a timeline. Output plain prose only — no markdown, no code, no JSON, no thinking. /no_think'
const DESC_USER = 'These are evenly-spaced frames from a video clip. Describe in detail what is happening throughout the video from start to finish. Plain prose only. /no_think'

// ─── Public API ───────────────────────────────────────────────────────────────

export async function processVideoURL(
  url: string,
  onProgress?: (tone: CaptionTone) => void,
): Promise<CaptionResults> {
  // Try the Vite dev proxy first (works in `npm run dev`).
  // In the production web build, fall back to fetching the URL directly — most
  // video CDNs (including the hackathon GCS bucket) send permissive CORS headers.
  let blob: Blob
  const proxyUrl = `/api/video-proxy?url=${encodeURIComponent(url)}`
  const proxyRes = await fetch(proxyUrl).catch(() => null)

  if (proxyRes && proxyRes.ok) {
    blob = await proxyRes.blob()
  } else {
    // Direct fetch — works when the server sends Access-Control-Allow-Origin: *
    const directRes = await fetch(url)
    if (!directRes.ok) throw new Error(`Failed to fetch video: ${directRes.status}`)
    blob = await directRes.blob()
  }

  if (!blob || blob.size === 0) throw new Error('Downloaded video is empty.')

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
