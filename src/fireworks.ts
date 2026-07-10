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
    'You are a BBC or National Geographic documentary narrator. Your captions are precise, factual, and authoritative. Rules: active voice, present tense, no bullet points, no clichés, no filler phrases like "we see" or "the video shows". Structure: one strong establishing sentence naming the exact setting and subjects, followed by a clear sequence of the key actions that unfold. CRITICAL: mention specific visual details — the actual subject, the actual setting, the actual action. Generic captions score zero. /no_think',
  sarcastic:
    'You are a world-class sarcastic commentator with bone-dry wit. Your captions treat the obvious as absurd, the mundane as baffling. Rules: NO exclamation marks (they kill the deadpan). NO "literally". NO "actually" used sincerely. Every sentence must land with a smirk. Use ironic understatement. CRITICAL: you MUST accurately reference what is actually happening in the video — sarcasm about the wrong subject scores zero on accuracy. The joke must be about the specific thing shown, not a generic observation. /no_think',
  humorous_tech:
    'You are a senior developer doing Twitch commentary on a random video for your dev audience. Frame EVERYTHING through a programmer/tech lens using specific references: git commits, merge conflicts, Stack Overflow, "works on my machine", unit tests, deployment pipelines, NullPointerException, "it\'s a feature not a bug", pull requests, rubber duck debugging. CRITICAL: the tech reference must map onto what is actually happening in the video — make the analogy fit the specific visual. Your dev audience will call you out if the reference doesn\'t land. /no_think',
  humorous_non_tech:
    'You are a stand-up comedian doing crowd work about a video — no jargon, pure observational humor. Styles to draw from: absurdist takes, relatable everyday observations, punny wordplay, "main character energy", "the audacity", "nobody asked for this but here we are". Rules: NO technical terms, NO programmer references, accessible to anyone. CRITICAL: the joke must be grounded in what is actually shown — a funny observation about the specific subject/action/setting, not generic comedy filler. /no_think',
}

const SUMMARY_USER_PROMPT = (videoDescription: string) => `Video description:
${videoDescription}

Write a caption (2–4 sentences) for this video in your assigned tone.

Requirements:
- Accurately reflect the specific content: the actual subject, setting, and actions described above.
- Reference at least one specific visual detail from the description (a colour, an object, a movement).
- Stay completely in your assigned tone — do not break character.
- Do NOT use generic filler like "a video shows" or "we can see".
- Do NOT add a title, label, or preamble.

You MUST respond with a single raw JSON object and nothing else. No markdown, no code fences, no explanation, no thinking.
The JSON must have exactly one key:
- "summary": a string containing 2–4 sentences in your assigned tone.

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

// Max frames the vision model handles well before attention dilutes.
// 20 = sweet spot: full temporal coverage without token overload.
const MAX_FRAMES = 20
// 896px wide = same as agent.py. Vision models internally downsample above this.
// Going higher (1080p/4K) bloats the base64 payload 4-16x with zero accuracy gain.
const FRAME_WIDTH = 896
// JPEG quality 0.92 = near-lossless. Preserves fine details (text, clothing colours,
// facial expressions) that 0.6 compression destroys.
const FRAME_QUALITY = 0.92

// Adaptive frame count: more frames for longer videos, capped at MAX_FRAMES.
// Short clips get denser sampling; long clips get evenly spread coverage.
function adaptiveFrameCount(duration: number): number {
  if (duration <= 15)  return 8
  if (duration <= 30)  return 12
  if (duration <= 60)  return 16
  if (duration <= 120) return 20
  // Beyond 2 min: still 20 frames but spread across the full duration
  return MAX_FRAMES
}

// Perceptual difference between two canvas frames (0 = identical, 1 = completely different).
// Samples a 16x16 grid of pixels — fast enough to run on every candidate frame.
function frameDiff(a: ImageData, b: ImageData): number {
  let diff = 0
  const step = Math.floor(a.data.length / (16 * 16 * 4))
  let count = 0
  for (let i = 0; i < a.data.length; i += step * 4) {
    diff += Math.abs(a.data[i] - b.data[i])
      + Math.abs(a.data[i+1] - b.data[i+1])
      + Math.abs(a.data[i+2] - b.data[i+2])
    count++
  }
  return count > 0 ? diff / (count * 255 * 3) : 0
}

async function seekTo(video: HTMLVideoElement, t: number): Promise<void> {
  return new Promise(res => {
    const done = () => { video.removeEventListener('seeked', done); res() }
    video.addEventListener('seeked', done)
    video.currentTime = t
  })
}

async function captureFrames(video: HTMLVideoElement): Promise<string[]> {
  // Resolve true duration — some formats report 0 until seeked to end
  let duration = video.duration
  if (!isFinite(duration) || duration <= 0) {
    await seekTo(video, 1e9)
    duration = video.duration
  }
  if (!isFinite(duration) || duration <= 0) duration = 30

  const nFrames = adaptiveFrameCount(duration)

  // Canvas sized to FRAME_WIDTH, preserving aspect ratio
  const canvas = document.createElement('canvas')
  canvas.width = FRAME_WIDTH
  canvas.height = Math.round(FRAME_WIDTH * (video.videoHeight / Math.max(video.videoWidth, 1)))
  const ctx = canvas.getContext('2d')!

  // Phase 1: capture candidate frames at evenly-spaced timestamps.
  // We sample nFrames + 4 extra candidates so the dedup pass has room to work.
  const candidateCount = Math.min(nFrames + 4, MAX_FRAMES + 4)
  const interval = duration / (candidateCount + 1)
  const candidates: { ts: number; dataUrl: string; imageData: ImageData }[] = []

  for (let i = 1; i <= candidateCount; i++) {
    const ts = interval * i
    await seekTo(video, ts)
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
    candidates.push({ ts, dataUrl: canvas.toDataURL('image/jpeg', FRAME_QUALITY), imageData })
  }

  // Phase 2: deduplicate — drop frames that are visually near-identical to the
  // previous kept frame (diff < 0.04 = less than 4% pixel change = scene hasn't moved).
  // This removes redundant static frames and keeps only meaningful visual transitions.
  const kept: typeof candidates = [candidates[0]]
  for (let i = 1; i < candidates.length; i++) {
    const diff = frameDiff(candidates[i].imageData, kept[kept.length - 1].imageData)
    if (diff >= 0.04) kept.push(candidates[i])
    if (kept.length >= nFrames) break
  }

  // If dedup removed too many (very static video), pad back with evenly-spaced originals
  if (kept.length < Math.min(nFrames, candidates.length)) {
    const step = Math.floor(candidates.length / nFrames)
    for (let i = 0; i < candidates.length && kept.length < nFrames; i += step) {
      if (!kept.find(k => k.ts === candidates[i].ts)) kept.push(candidates[i])
    }
    kept.sort((a, b) => a.ts - b.ts)
  }

  return kept.slice(0, MAX_FRAMES).map(f => f.dataUrl)
}

async function extractFrames(file: File): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const video = document.createElement('video')
    video.preload = 'metadata'
    video.muted = true
    video.playsInline = true
    video.src = url
    video.addEventListener('error', () => { URL.revokeObjectURL(url); reject(new Error('Video load failed')) })
    video.addEventListener('loadedmetadata', () => {
      captureFrames(video)
        .then(frames => { URL.revokeObjectURL(url); resolve(frames) })
        .catch(err => { URL.revokeObjectURL(url); reject(err) })
    })
  })
}

// Pass 1 — exhaustive visual inventory: force the model to list every concrete
// detail it can see before synthesizing. This prevents it from skipping details.
const INVENTORY_SYSTEM = `You are a forensic video analyst. Your job is to extract every observable fact from these frames.

For EACH frame, state:
- Exact timestamp position (early/mid/late in the clip)
- Every subject visible: people (age estimate, gender, exact clothing colours and style, hair colour/length, accessories), animals (species, colour, size), objects (what, colour, size, condition)
- Exact actions occurring: body position, direction of movement, what they are doing with their hands/body
- Camera behaviour: static, panning left/right, zooming in/out, handheld shake
- Background details: what is behind the subjects, any text/signs/logos visible

Then write a SETTING paragraph: exact environment type, time of day, lighting, weather if outdoors.

Rules: plain prose only, no markdown, no JSON, no bullet points. Be exhaustive — missing a detail here means it cannot appear in the final caption. /no_think`

const INVENTORY_USER = `These frames are ordered chronologically from the start to the end of the video clip.

Analyse every frame in sequence. For each one, describe every visible subject, their exact appearance, what they are doing, and what the camera is doing. Then describe the overall setting.

Do not summarise. Do not skip frames. Name actual colours, actual objects, actual movements. Plain prose only. /no_think`

// Pass 2 — synthesize the inventory into a rich narrative description.
// This is what gets passed to the caption pass.
const SYNTHESIZE_SYSTEM = `You are a professional video narrator. You have been given a detailed frame-by-frame inventory of a video clip.

Using ONLY the facts in that inventory, write a single cohesive narrative description of the video in 4–6 paragraphs covering:
1. The exact setting and environment
2. Every subject — their precise appearance and what makes them distinctive
3. A chronological account of all actions from start to finish
4. The atmosphere, mood, lighting, and pace
5. Any notable details: text on screen, unusual elements, camera movement

Rules:
- Do NOT invent anything not in the inventory.
- Do NOT use vague phrases like "a person does something" or "various activities".
- Name the actual colours, objects, and movements from the inventory.
- Plain narrative prose only — no bullet points, no markdown, no JSON.
/no_think`

// ─── Public API ───────────────────────────────────────────────────────────────

export type ProcessStep = 'frames' | 'vision' | 'synthesis' | 'captions'

export async function processVideoURL(
  url: string,
  onProgress?: (tone: CaptionTone) => void,
  onStep?: (step: ProcessStep) => void,
): Promise<CaptionResults> {
  // Load the URL directly into a <video> element — no full download needed.
  // The browser streams just enough to seek and capture frames.
  // Falls back to proxy only if direct load fails (CORS-blocked URLs).
  onStep?.('frames')

  let frameDataUrls: string[]
  try {
    frameDataUrls = await new Promise<string[]>((resolve, reject) => {
      const video = document.createElement('video')
      video.preload = 'metadata'
      video.muted = true
      video.playsInline = true
      video.crossOrigin = 'anonymous'
      video.src = url
      video.addEventListener('error', () => reject(new Error('direct')))
      video.addEventListener('loadedmetadata', () => {
        captureFrames(video).then(resolve).catch(reject)
      })
    })
  } catch (directErr) {
    // Direct load failed (likely CORS) — fall back to proxy/blob download
    const proxyUrl = `/api/video-proxy?url=${encodeURIComponent(url)}`
    const proxyRes = await fetch(proxyUrl).catch(() => null)
    let objectUrl: string
    if (proxyRes && proxyRes.ok) {
      objectUrl = URL.createObjectURL(await proxyRes.blob())
    } else {
      const directRes = await fetch(url)
      if (!directRes.ok) throw new Error(`Failed to fetch video: ${directRes.status}`)
      const blob = await directRes.blob()
      if (!blob || blob.size === 0) throw new Error('Downloaded video is empty.')
      objectUrl = URL.createObjectURL(blob)
    }
    try {
      frameDataUrls = await new Promise<string[]>((resolve, reject) => {
        const video = document.createElement('video')
        video.preload = 'metadata'
        video.muted = true
        video.playsInline = true
        video.src = objectUrl
        video.addEventListener('error', () => reject(new Error('Video load failed')))
        video.addEventListener('loadedmetadata', () => {
          captureFrames(video).then(resolve).catch(reject)
        })
      })
    } finally {
      URL.revokeObjectURL(objectUrl)
    }
  }

  if (frameDataUrls.length === 0) throw new Error('Could not extract frames from video.')

  onStep?.('vision')
  // Pass 1 — exhaustive per-frame visual inventory
  const inventoryChoice = await callFW([
    { role: 'system', content: INVENTORY_SYSTEM },
    { role: 'user', content: [
      ...frameDataUrls.map(u => ({ type: 'image_url' as const, image_url: { url: u } })),
      { type: 'text' as const, text: INVENTORY_USER },
    ]},
  ], GEMMA_MODELS.B31, { temperature: 0.1, maxTokens: 3000 })

  const inventory = (inventoryChoice.message.content ?? '')
    .replace(/<think>[\s\S]*?<\/think>/gi, '').trim()

  onStep?.('synthesis')
  // Pass 2 — synthesize inventory into a rich narrative description
  const synthChoice = await callFW([
    { role: 'system', content: SYNTHESIZE_SYSTEM },
    { role: 'user', content: `Frame-by-frame inventory:\n${inventory}\n\nWrite the cohesive narrative description now. Plain prose only. /no_think` },
  ], GEMMA_MODELS.B31, { temperature: 0.1, maxTokens: 2400 })

  const videoDescription = (synthChoice.message.content ?? '')
    .replace(/<think>[\s\S]*?<\/think>/gi, '').trim()
    || inventory
    || `Video from URL: ${url}`

  onStep?.('captions')
  return runCaptionPass(videoDescription, onProgress)
}

export async function processVideoFile(
  file: File,
  onProgress?: (tone: CaptionTone) => void,
  onUploadProgress?: (phase: 'uploading' | 'processing', pct?: number) => void,
  onStep?: (step: ProcessStep) => void,
): Promise<CaptionResults> {
  onStep?.('frames')
  onUploadProgress?.('uploading', 10)

  const frameDataUrls = await extractFrames(file)
  if (frameDataUrls.length === 0) throw new Error('Could not extract frames from video.')

  onStep?.('vision')
  onUploadProgress?.('processing')

  // Pass 1 — exhaustive per-frame visual inventory
  const inventoryChoice = await callFW([
    { role: 'system', content: INVENTORY_SYSTEM },
    { role: 'user', content: [
      ...frameDataUrls.map(url => ({ type: 'image_url' as const, image_url: { url } })),
      { type: 'text' as const, text: INVENTORY_USER },
    ]},
  ], GEMMA_MODELS.B31, { temperature: 0.1, maxTokens: 3000 })

  const inventory = (inventoryChoice.message.content ?? '')
    .replace(/<think>[\s\S]*?<\/think>/gi, '').trim()

  onStep?.('synthesis')
  // Pass 2 — synthesize inventory into a rich narrative description
  const synthChoice = await callFW([
    { role: 'system', content: SYNTHESIZE_SYSTEM },
    { role: 'user', content: `Frame-by-frame inventory:\n${inventory}\n\nWrite the cohesive narrative description now. Plain prose only. /no_think` },
  ], GEMMA_MODELS.B31, { temperature: 0.1, maxTokens: 2400 })

  const videoDescription = (synthChoice.message.content ?? '')
    .replace(/<think>[\s\S]*?<\/think>/gi, '').trim()
    || inventory
    || `Video file: ${file.name}`

  onStep?.('captions')
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
