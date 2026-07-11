/**
 * gemini-native.ts
 *
 * Native Google Gemini 2.5 Flash API client.
 * Used as the PRIMARY inference engine — Fireworks is the fallback.
 *
 * Supports:
 *   - Text chat (sendGeminiMessage)
 *   - Multimodal vision with inline base64 images (callGeminiVision)
 *   - JSON-mode output (responseSchema)
 */

export const GEMINI_BYOK_KEY = 'xo-gemini-api-key'

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta'

// Gemini 2.5 Flash — best quality/speed/cost for both vision and text
export const GEMINI_MODEL = 'gemini-2.5-flash'

export function getGeminiKey(): string {
  return (
    localStorage.getItem(GEMINI_BYOK_KEY) ||
    (import.meta.env.VITE_GEMINI_API_KEY as string | undefined) ||
    ''
  )
}

export function hasGeminiKey(): boolean {
  return getGeminiKey().length > 0
}

// ─── Types ────────────────────────────────────────────────────────────────────

type GeminiRole = 'user' | 'model'

interface GeminiTextPart { text: string }
interface GeminiInlineDataPart {
  inline_data: { mime_type: string; data: string }
}
type GeminiPart = GeminiTextPart | GeminiInlineDataPart

interface GeminiContent {
  role: GeminiRole
  parts: GeminiPart[]
}

interface GeminiRequest {
  contents: GeminiContent[]
  system_instruction?: { parts: [{ text: string }] }
  generationConfig?: {
    temperature?: number
    maxOutputTokens?: number
    responseMimeType?: string
  }
}

// ─── Core fetch ───────────────────────────────────────────────────────────────

async function callGemini(
  req: GeminiRequest,
  attempt = 0,
): Promise<string> {
  const key = getGeminiKey()
  if (!key) throw new GeminiUnavailableError('No Gemini API key configured')

  const url = `${GEMINI_BASE}/models/${GEMINI_MODEL}:generateContent?key=${key}`

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  })

  if (!res.ok) {
    const errText = await res.text().catch(() => '')
    // 429 = quota exhausted → signal fallback
    if (res.status === 429) throw new GeminiQuotaError(`Gemini quota exceeded: ${errText}`)
    if (res.status === 401 || res.status === 403) throw new GeminiUnavailableError(`Gemini auth error ${res.status}`)
    if (attempt < 2 && res.status >= 500) {
      await sleep(1500 * (attempt + 1))
      return callGemini(req, attempt + 1)
    }
    throw new Error(`Gemini API error ${res.status}: ${errText}`)
  }

  const data = await res.json()
  const text: string = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
  return text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim()
}

// ─── Sentinel errors (caught by fallback wrapper in fireworks.ts) ─────────────

export class GeminiQuotaError extends Error {
  constructor(msg: string) { super(msg); this.name = 'GeminiQuotaError' }
}
export class GeminiUnavailableError extends Error {
  constructor(msg: string) { super(msg); this.name = 'GeminiUnavailableError' }
}

// ─── Public helpers ───────────────────────────────────────────────────────────

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)) }

/**
 * Text-only chat — mirrors callFW signature for easy swap.
 */
export async function callGeminiText(
  systemPrompt: string,
  userText: string,
  opts?: { temperature?: number; maxTokens?: number; jsonMode?: boolean },
): Promise<string> {
  const { temperature = 0.7, maxTokens = 2000, jsonMode = false } = opts ?? {}
  const req: GeminiRequest = {
    system_instruction: systemPrompt ? { parts: [{ text: systemPrompt }] } : undefined,
    contents: [{ role: 'user', parts: [{ text: userText }] }],
    generationConfig: {
      temperature,
      maxOutputTokens: maxTokens,
      ...(jsonMode ? { responseMimeType: 'application/json' } : {}),
    },
  }
  return callGemini(req)
}

/**
 * Multimodal vision — accepts base64 data-URLs (image/jpeg) + text prompt.
 * Used for the inventory pass and synthesis pass.
 */
export async function callGeminiVision(
  systemPrompt: string,
  imageDataUrls: string[],
  textPrompt: string,
  opts?: { temperature?: number; maxTokens?: number },
): Promise<string> {
  const { temperature = 0.1, maxTokens = 6000 } = opts ?? {}

  const imageParts: GeminiPart[] = imageDataUrls.map(url => {
    // url is "data:image/jpeg;base64,<data>"
    const [header, data] = url.split(',', 2)
    const mimeType = header.replace('data:', '').replace(';base64', '')
    return { inline_data: { mime_type: mimeType || 'image/jpeg', data } }
  })

  const req: GeminiRequest = {
    system_instruction: systemPrompt ? { parts: [{ text: systemPrompt }] } : undefined,
    contents: [{
      role: 'user',
      parts: [...imageParts, { text: textPrompt }],
    }],
    generationConfig: { temperature, maxOutputTokens: maxTokens },
  }
  return callGemini(req)
}

/**
 * Multi-turn chat with history — used by sendMessage / sendToGemini.
 */
export async function callGeminiChat(
  systemPrompt: string,
  history: { role: 'user' | 'assistant'; content: string }[],
  userMessage: string,
  opts?: { temperature?: number },
): Promise<string> {
  const { temperature = 0.9 } = opts ?? {}

  const contents: GeminiContent[] = [
    ...history.map(m => ({
      role: (m.role === 'assistant' ? 'model' : 'user') as GeminiRole,
      parts: [{ text: m.content }],
    })),
    { role: 'user' as GeminiRole, parts: [{ text: userMessage }] },
  ]

  const req: GeminiRequest = {
    system_instruction: systemPrompt ? { parts: [{ text: systemPrompt }] } : undefined,
    contents,
    generationConfig: { temperature, maxOutputTokens: 2000 },
  }
  return callGemini(req)
}
