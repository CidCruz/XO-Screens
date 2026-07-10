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
    responseFormat?: 'json_object'
  },
): Promise<FWChoice> {
  const { temperature = 0.7, maxTokens, tools, attempt = 0, responseFormat } = options ?? {}

  const body: Record<string, unknown> = {
    model,
    messages,
    temperature,
  }
  if (maxTokens !== undefined) body.max_tokens = maxTokens
  if (responseFormat) body.response_format = { type: responseFormat }
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
    'You are a BBC or National Geographic documentary narrator writing a full, detailed video summary. Your output must be precise, factual, authoritative, and RICH IN DETAIL. Rules: active voice, present tense, no bullet points, no clichés, no filler phrases like "we see" or "the video shows". Your summary must cover: (1) the exact setting — environment type, location, time of day, lighting; (2) every subject — their precise appearance including clothing colours, physical features, and distinguishing details; (3) the full chronological sequence of actions — what moves, in which direction, at what speed, how subjects interact, what changes, how it ends; (4) the atmosphere and overall mood; (5) any notable details like text, objects, or unusual elements. CRITICAL: you MUST describe the complete arc of events from start to finish, not just the opening scene. Every sentence must contain at least one specific concrete detail — actual colour, actual object, actual movement direction. Vague or generic sentences score zero. /no_think',
  sarcastic:
    'You are a world-class sarcastic commentator with bone-dry wit writing a full, detailed video summary. Your output treats the obvious as absurd and the mundane as baffling — but it must be PACKED WITH ACCURATE DETAIL. Rules: NO exclamation marks (they kill the deadpan). NO "literally". NO "actually" used sincerely. Every sentence must land with a smirk AND contain a specific accurate detail from the video. You must cover: the setting, the subjects and their appearance, the full sequence of events from start to finish, and the overall vibe — all through your sarcastic lens. CRITICAL: sarcasm about the wrong subject or a vague description scores zero. The wit must be anchored to the specific colours, objects, movements, and sequence of events actually shown. Do not just comment on the opening — track the whole video. /no_think',
  humorous_tech:
    'You are a senior developer doing live Twitch commentary on a random video, writing a full detailed summary for your dev audience. Frame EVERYTHING through a programmer/tech lens — git commits, merge conflicts, Stack Overflow, "works on my machine", unit tests, deployment pipelines, NullPointerException, "it\'s a feature not a bug", pull requests, rubber duck debugging, O(n²) complexity, race conditions, memory leaks. Your summary must be DETAILED: cover the setting, every subject and their appearance, the full chronological sequence of actions, and the overall arc — all mapped to tech analogies. CRITICAL: every tech reference must precisely map onto what is actually happening — the specific motion, the specific subjects, the specific sequence. Cover the full video, not just the opening frame. Your dev audience will roast you if the analogy doesn\'t fit the actual action. /no_think',
  humorous_non_tech:
    'You are a stand-up comedian doing crowd work about a video, writing a full detailed summary — no jargon, pure observational humor accessible to anyone. Draw from: absurdist takes, relatable everyday observations, punny wordplay, "main character energy", "the audacity", "nobody asked for this but here we are", dramatic narration of mundane events. Your summary must be DETAILED: cover the setting, every subject and their appearance, the full chronological sequence of events, and the overall vibe — all through your comedic lens. CRITICAL: every joke must be grounded in specific accurate details — actual colours, actual objects, actual movements, actual sequence of events. Do not just riff on the opening frame — follow the full arc of the video. Vague comedy filler with no connection to the actual content scores zero. /no_think',
}

// Truncate description to ~3000 chars so the full prompt stays well within context limits.
// The synthesis pass already distilled the key facts — we don't need the raw 6000-token inventory here.
function truncateDescription(desc: string, maxChars = 3500): string {
  if (desc.length <= maxChars) return desc
  // Try sentence boundary first, then word boundary
  const sentenceCut = desc.lastIndexOf('. ', maxChars)
  if (sentenceCut > maxChars * 0.6) return desc.slice(0, sentenceCut + 1)
  const wordCut = desc.lastIndexOf(' ', maxChars)
  return wordCut > 0 ? desc.slice(0, wordCut) : desc.slice(0, maxChars)
}

const SUMMARY_USER_PROMPT = (videoDescription: string) => {
  const desc = truncateDescription(videoDescription)
  return `Video description:
${desc}

Using the video description above, write a detailed informative summary in your assigned tone. The summary must be 5 to 8 sentences long. Cover the exact setting, every subject's appearance (clothing colours, physical features), the full sequence of actions from start to finish, the key moment, how it ends, the atmosphere, and any notable details. Every sentence must include at least one specific concrete detail such as an actual colour, object, or movement direction. Do not describe only the opening scene — cover the entire video. Do not use filler phrases like a video shows or we can see. Do not add a title or preamble.

Your response must be a single JSON object with one key called summary whose value is your completed summary text. Example format:
{"summary": "WRITE YOUR ACTUAL SUMMARY TEXT HERE. Replace this entire placeholder with your real summary sentences."}

Output only the JSON object. Start with { and end with }. /no_think`
}

function parseToneResult(raw: string): ToneResult | null {
  const cleaned = raw
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/^```json\s*/im, '')
    .replace(/^```\s*/im, '')
    .replace(/```\s*$/gm, '')
    .trim()

  if (!cleaned || cleaned.length < 10) return null

  // 1. Try strict JSON parse on the whole cleaned string
  try {
    const parsed = JSON.parse(cleaned)
    if (typeof parsed?.summary === 'string' && parsed.summary.trim().length >= 10)
      return { summary: parsed.summary.trim() }
  } catch { /* fall through */ }

  // 2. Extract first {...} block and try parsing that
  const jsonMatch = cleaned.match(/\{[\s\S]*?\}/)
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0])
      if (typeof parsed?.summary === 'string' && parsed.summary.trim().length >= 10)
        return { summary: parsed.summary.trim() }
    } catch { /* fall through */ }

    // 3. Regex-extract the "summary" value from the JSON block
    const summaryMatch = jsonMatch[0].match(/"summary"\s*:\s*"((?:[^"\\]|\\.)*)"/s)
    if (summaryMatch) {
      const text = summaryMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"').trim()
      if (text.length >= 10) return { summary: text }
    }
  }

  // 4. Last resort: if the model returned plain prose (no JSON at all), use it directly
  // This handles cases where the model ignores the JSON instruction entirely
  if (!cleaned.startsWith('{') && cleaned.length >= 30) {
    const prose = cleaned.replace(/^[A-Za-z\s]{0,20}:\s*/m, '').trim()
    // Reject placeholder text echoed from the prompt
    const isPlaceholder = /your\s+\d[^.]*sentence/i.test(prose) || /summary here/i.test(prose)
    if (prose.length >= 30 && !isPlaceholder) return { summary: prose }
  }

  return null
}

// ─── Per-style temperatures (mirrors agent.py exactly) ────────────────────────
// formal: low temp = factual, consistent. humorous: high temp = creative, varied.
const STYLE_TEMPERATURES: Record<CaptionTone, number> = {
  formal:            0.15,
  sarcastic:         0.75,
  humorous_tech:     0.78,
  humorous_non_tech: 0.80,
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
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const msgs: FWMessage[] = [
          { role: 'system', content: TONE_SYSTEM_PROMPTS[tone] },
          { role: 'user', content: SUMMARY_USER_PROMPT(videoDescription) },
        ]
        const choice = await callFW(msgs, GEMMA_MODELS.E4B, { temperature, maxTokens: 2000, responseFormat: 'json_object' })
        const raw = choice.message.content ?? ''
        const parsed = parseToneResult(raw)
        // Reject if it echoed placeholder text from the prompt
        if (parsed && !/your\s+\d[^.]*sentence|summary here|WRITE YOUR ACTUAL/i.test(parsed.summary)) {
          toneResults[tone] = parsed
          onProgress?.(tone)
          return
        }
        lastErr = new Error('Model returned placeholder or empty response')
      } catch (err) {
        lastErr = err
      }
      if (attempt < 4) await new Promise(r => setTimeout(r, 1000 * (attempt + 1)))
    }
    toneResults[tone] = {
      summary: `Could not generate summary after 5 attempts. ${lastErr instanceof Error ? lastErr.message : String(lastErr)}`,
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

// Pass 1 — exhaustive visual inventory
const INVENTORY_SYSTEM = `You are a forensic video analyst, motion-tracking expert, and visual detail specialist. Your sole job is to extract EVERY single observable fact from these frames with maximum precision and completeness. Nothing is too small to mention.

For EACH frame (label them Frame 1, Frame 2, Frame 3, etc.), you MUST document ALL of the following in full detail:

TIMESTAMP & POSITION: State the frame number and exactly where it falls in the clip (e.g. "Frame 1 — opening, approximately 0–5% of clip", "Frame 8 — midpoint, approximately 45–55% of clip", "Frame 15 — near end, approximately 85–95% of clip").

SUBJECTS — describe every single subject visible:
  People: estimated age range, apparent gender, exact clothing description (every garment — colour, style, pattern, brand/logo if visible, fit), hair colour and style, skin tone, facial expression (neutral/smiling/concentrating/surprised/etc.), any accessories (glasses, jewellery, hats, bags), body build, height impression relative to surroundings.
  Animals: species, breed if identifiable, exact coat/fur/feather colours and patterns, size relative to surroundings, posture, expression.
  Vehicles: type, colour, make/model if identifiable, condition, any text or numbers on it.
  Objects: every significant object — what it is, exact colour, approximate size, condition, what it is being used for.

MOTION & ACTION — describe every movement with maximum precision:
  Who or what is moving, in exactly which direction (left, right, toward camera, away from camera, upward, downward, diagonal), at what speed (stationary, slow, moderate, fast, very fast), using which body parts (right hand reaching forward, left leg stepping sideways, torso rotating clockwise, head turning right), what the result of the movement is, and whether subjects are interacting with each other or with objects.
  If nothing is moving, explicitly state that the scene is static.

FACIAL EXPRESSIONS & EMOTIONS: describe the emotional state of every person visible — are they focused, relaxed, excited, tense, laughing, speaking, reacting to something?

CAMERA BEHAVIOUR: is the camera completely static, panning left, panning right, tilting up, tilting down, zooming in, zooming out, tracking a moving subject, handheld with shake, or has there been a cut to a new angle?

SHOT TYPE & FRAMING: extreme close-up, close-up, medium close-up, medium shot, medium wide, wide shot, or extreme wide shot? Are subjects centred, left-aligned, right-aligned? Is there negative space?

BACKGROUND & ENVIRONMENT: describe everything visible behind the subjects — walls (colour, material, any art/posters/windows), floor (material, colour, pattern), ceiling if visible, outdoor elements (sky colour, clouds, trees, buildings, roads, vehicles in background), furniture, equipment, any text/signs/logos/numbers/brand names visible anywhere in the frame.

LIGHTING: natural daylight, artificial indoor lighting, golden hour, night, overcast, harsh direct light, soft diffused light, shadows direction, any coloured lighting, backlit or front-lit subjects.

COLOUR PALETTE: what are the dominant colours in this frame overall?

After completing ALL frames, write two final sections:

CHRONOLOGICAL EVENT SEQUENCE: Write a detailed paragraph describing the complete sequence of events from the very first frame to the very last — what was the initial state, what changed and when, what were the key transitions, what was the final state. This must read as a continuous timeline of everything that happened.

KEY OBSERVATIONS: Note anything unusual, surprising, distinctive, or particularly important about this video — anything that makes it stand out or that a viewer would immediately notice.

CRITICAL RULES:
- Plain prose only. No markdown headers, no JSON, no bullet points, no numbered lists.
- NEVER skip a frame. NEVER write "similar to previous frame" or "same as above" — describe each frame completely and independently.
- NEVER invent details. If something is unclear or partially visible, describe exactly what you CAN see and note the uncertainty.
- The more detail you provide here, the more accurate the final summary will be. Omitting a detail here means it CANNOT appear in the final output.
/no_think`

const INVENTORY_USER = `These frames are ordered strictly chronologically from the very start to the very end of the video clip. They represent the complete temporal span of the video with no gaps.

Your task: analyse EVERY single frame with maximum thoroughness. For each frame, document:
- Frame number and timeline position
- Every subject: complete appearance description (clothing colours, physical features, expressions, accessories)
- Every movement: who/what is moving, exact direction, speed, body mechanics, interactions
- Camera behaviour: static/panning/zooming/cutting
- Shot type and framing
- Complete background and environment description
- Lighting conditions
- Dominant colour palette

After all frames:
- Write a CHRONOLOGICAL EVENT SEQUENCE paragraph: the complete timeline of everything that happened from first frame to last
- Write a KEY OBSERVATIONS paragraph: anything distinctive, unusual, or immediately striking about this video

Absolute rules:
- Do NOT skip any frame
- Do NOT write "similar to previous" — describe each frame fully and independently
- Do NOT summarise early — complete all frames first
- Name actual colours, actual objects, actual movements, actual directions
- Plain prose only — no bullet points, no markdown, no JSON
/no_think`

// Pass 2 — synthesize the inventory into a rich narrative description.
const SYNTHESIZE_SYSTEM = `You are a master documentary narrator and video analyst. You have been given an exhaustive frame-by-frame inventory of a video clip with full motion tracking, appearance details, and chronological event data.

Using ONLY the facts in that inventory, write a single comprehensive narrative description of the video. This description will be used to generate detailed summaries, so it must be as rich, specific, and complete as possible. Write 7–10 paragraphs covering ALL of the following:

Paragraph 1 — SETTING & ENVIRONMENT: the exact location type, indoor or outdoor, time of day, lighting conditions, weather if applicable, dominant colours of the environment, spatial layout, and overall visual atmosphere.

Paragraph 2 — SUBJECTS & APPEARANCE: every person, animal, vehicle, or significant object — their complete appearance description including exact clothing colours and styles, physical features, hair, accessories, size, and any distinguishing characteristics that make them identifiable.

Paragraph 3 — OPENING STATE: exactly what is happening at the very beginning of the video — the initial positions of all subjects, the initial action or lack of action, the first movement that occurs.

Paragraph 4 — CHRONOLOGICAL ACTION SEQUENCE (PART 1, early to mid): a detailed account of everything that happens in the first half of the video — every movement with direction and speed, every interaction, every change in position or state.

Paragraph 5 — CHRONOLOGICAL ACTION SEQUENCE (PART 2, mid to end): a detailed account of everything that happens in the second half — continuing the timeline through to the final frame.

Paragraph 6 — KEY MOMENT: the single most significant, dramatic, or climactic moment in the video — describe it in maximum detail including what led up to it and what immediately followed.

Paragraph 7 — RESOLUTION & FINAL STATE: how the video ends — the final positions of all subjects, the final action, the final visual state of the scene.

Paragraph 8 — ATMOSPHERE, MOOD & PACE: the overall emotional tone, energy level, rhythm, and pace of the video — is it fast-paced or slow, tense or relaxed, joyful or serious, chaotic or orderly?

Paragraph 9 — CAMERA & CINEMATOGRAPHY: how the camera behaves throughout — movements, cuts, shot types used, what the framing emphasises, any notable cinematographic choices.

Paragraph 10 — NOTABLE DETAILS & DISTINCTIVE ELEMENTS: any text visible on screen, brand names, numbers, unusual objects, surprising elements, background details, implied sounds, or anything that makes this specific video distinctive and different from a generic video of the same type.

CRITICAL RULES:
- Do NOT invent anything not present in the inventory.
- Do NOT use vague phrases: "a person does something", "various activities occur", "the video shows", "we can see", "there is movement".
- Every sentence must contain at least one specific concrete detail — an actual colour, an actual named object, an actual direction of movement.
- Describe motion with full precision: "walks briskly from the left side of frame toward the camera", "raises both arms above head while leaning backward", "vehicle accelerates away from camera leaving a dust trail" — never just "moves" or "goes".
- Plain narrative prose only — no bullet points, no markdown headers, no JSON, no numbered lists.
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
  ], GEMMA_MODELS.B31, { temperature: 0.1, maxTokens: 6000 })

  const inventory = (inventoryChoice.message.content ?? '')
    .replace(/<think>[\s\S]*?<\/think>/gi, '').trim()

  onStep?.('synthesis')
  // Pass 2 — synthesize inventory into a rich narrative description
  const synthChoice = await callFW([
    { role: 'system', content: SYNTHESIZE_SYSTEM },
    { role: 'user', content: `Frame-by-frame inventory with full motion tracking and appearance details:\n\n${inventory}\n\nNow write the complete 7–10 paragraph narrative description covering all required sections. Every sentence must contain specific concrete details. Plain prose only. /no_think` },
  ], GEMMA_MODELS.B31, { temperature: 0.1, maxTokens: 4000 })

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
  ], GEMMA_MODELS.B31, { temperature: 0.1, maxTokens: 6000 })

  const inventory = (inventoryChoice.message.content ?? '')
    .replace(/<think>[\s\S]*?<\/think>/gi, '').trim()

  onStep?.('synthesis')
  // Pass 2 — synthesize inventory into a rich narrative description
  const synthChoice = await callFW([
    { role: 'system', content: SYNTHESIZE_SYSTEM },
    { role: 'user', content: `Frame-by-frame inventory with full motion tracking and appearance details:\n\n${inventory}\n\nNow write the complete 7–10 paragraph narrative description covering all required sections. Every sentence must contain specific concrete details. Plain prose only. /no_think` },
  ], GEMMA_MODELS.B31, { temperature: 0.1, maxTokens: 4000 })

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
