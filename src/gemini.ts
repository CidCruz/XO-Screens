import type { Message } from './types'

const API_KEY = import.meta.env.VITE_GEMINI_API_KEY
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${API_KEY}`

// ─────────────────────────────────────────────────────────────────────────────
// Video Captions & Summary
// ─────────────────────────────────────────────────────────────────────────────

export type CaptionTone = 'formal' | 'sarcastic' | 'humorous-tech' | 'humorous-nontech'

export interface ToneResult {
  captions: string   // time-stamped caption lines, newline-separated
  summary: string
}

export type CaptionResults = Record<CaptionTone, ToneResult>

const TONE_PROMPTS: Record<CaptionTone, string> = {
  formal:
    'You are a professional captioning and summarisation assistant. Write in a clear, neutral, formal register suitable for corporate or academic use.',
  sarcastic:
    'You are a witty, sarcastic captioning assistant. Drip every caption and the summary with dry sarcasm and sardonic commentary — but still convey the actual content accurately.',
  'humorous-tech':
    'You are a tech-savvy comedian captioning for a developer audience. Sprinkle in programming jokes, tech buzzwords used ironically, and geek humour throughout the captions and summary.',
  'humorous-nontech':
    'You are a stand-up comedian captioning for a general audience. Keep the humour accessible, punny, and light-hearted — no jargon. Make the captions and summary feel like a funny narrator at a roast.',
}

const CAPTION_INSTRUCTION = `
Analyse the video the user provides. Return your response as valid JSON with this exact shape:
{
  "captions": "0:00 – caption text\\n0:05 – caption text\\n...",
  "summary": "A concise paragraph summarising the entire video."
}
Only output the JSON object — no markdown fences, no extra text.
`.trim()

async function callGemini(parts: object[], systemPrompt: string): Promise<string> {
  const body = {
    contents: [{ role: 'user', parts }],
    systemInstruction: { parts: [{ text: systemPrompt }] },
    generationConfig: { temperature: 0.85, maxOutputTokens: 2048 },
  }
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const errBody = await res.text().catch(() => '')
    throw new Error(`Gemini API error ${res.status}: ${errBody}`)
  }
  const data = await res.json()
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
}

function parseToneResult(raw: string): ToneResult {
  try {
    // Strip any accidental markdown fences Gemini might add
    const clean = raw.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim()
    const parsed = JSON.parse(clean)
    return {
      captions: parsed.captions ?? '',
      summary:  parsed.summary  ?? '',
    }
  } catch {
    // Fallback: treat the whole response as a summary
    return { captions: '', summary: raw }
  }
}

/**
 * Upload a local video file and generate captions + summary in all four tones.
 * Uses inline base64 data — works for files up to ~20 MB comfortably.
 */
export async function processVideoFile(
  file: File,
  onProgress?: (tone: CaptionTone) => void,
): Promise<CaptionResults> {
  const arrayBuffer = await file.arrayBuffer()
  // Convert to base64 in chunks to avoid stack overflows on large files
  const bytes = new Uint8Array(arrayBuffer)
  let binary = ''
  const chunkSize = 8192
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize))
  }
  const base64 = btoa(binary)
  const mimeType = file.type || 'video/mp4'

  const results = {} as CaptionResults
  for (const tone of Object.keys(TONE_PROMPTS) as CaptionTone[]) {
    onProgress?.(tone)
    const parts = [
      { inlineData: { mimeType, data: base64 } },
      { text: CAPTION_INSTRUCTION },
    ]
    const raw = await callGemini(parts, TONE_PROMPTS[tone])
    results[tone] = parseToneResult(raw)
  }
  return results
}

/**
 * Process a publicly accessible video URL and generate captions + summary.
 * Gemini can fetch the URL directly via the fileData part.
 */
export async function processVideoURL(
  url: string,
  onProgress?: (tone: CaptionTone) => void,
): Promise<CaptionResults> {
  // Detect mime type from extension; default to mp4
  const ext = url.split('?')[0].split('.').pop()?.toLowerCase() ?? ''
  const mimeMap: Record<string, string> = {
    mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime',
    avi: 'video/x-msvideo', mkv: 'video/x-matroska',
  }
  const mimeType = mimeMap[ext] ?? 'video/mp4'

  const results = {} as CaptionResults
  for (const tone of Object.keys(TONE_PROMPTS) as CaptionTone[]) {
    onProgress?.(tone)
    const parts = [
      { fileData: { mimeType, fileUri: url } },
      { text: CAPTION_INSTRUCTION },
    ]
    const raw = await callGemini(parts, TONE_PROMPTS[tone])
    results[tone] = parseToneResult(raw)
  }
  return results
}

export async function sendAudioToGemini(messages: Message[], audioBlob: Blob): Promise<string> {
  const history = messages.map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }))

  const arrayBuffer = await audioBlob.arrayBuffer()
  const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)))
  const mimeType = audioBlob.type || 'audio/webm'

  const body = {
    contents: [
      ...history,
      { role: 'user', parts: [{ inlineData: { mimeType, data: base64 } }] },
    ],
    systemInstruction: {
      parts: [{ text: 'You are XO, an intelligent desktop AI assistant. The user sent a voice message — transcribe it mentally and respond. Be concise, helpful, and friendly.' }],
    },
    generationConfig: { temperature: 0.9, maxOutputTokens: 1024 },
  }

  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!res.ok) throw new Error(`Gemini API error: ${res.status}`)
  const data = await res.json()
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? 'No response.'
}

export async function sendToGeminiWithSystem(messages: Message[], userMessage: string, systemPrompt: string): Promise<string> {
  const history = messages.map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }))

  const body = {
    contents: [
      ...history,
      { role: 'user', parts: [{ text: userMessage }] },
    ],
    systemInstruction: {
      parts: [{ text: systemPrompt }],
    },
    generationConfig: { temperature: 0.9, maxOutputTokens: 1024 },
  }

  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!res.ok) throw new Error(`Gemini API error: ${res.status}`)
  const data = await res.json()
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? 'No response.'
}

export async function sendToGemini(messages: Message[], userMessage: string): Promise<string> {
  const history = messages.map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }))

  const body = {
    contents: [
      ...history,
      { role: 'user', parts: [{ text: userMessage }] },
    ],
    systemInstruction: {
      parts: [{ text: 'You are XO, an intelligent desktop AI assistant. Be concise, helpful, and friendly.' }],
    },
    generationConfig: { temperature: 0.9, maxOutputTokens: 1024 },
  }

  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!res.ok) throw new Error(`Gemini API error: ${res.status}`)
  const data = await res.json()
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? 'No response.'
}
