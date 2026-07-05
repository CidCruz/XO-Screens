import type { Message } from './types'

const API_KEY = import.meta.env.VITE_GEMINI_API_KEY
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${API_KEY}`

// Files API base — used for videos > 100 MB
const FILES_API_UPLOAD_URL = `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${API_KEY}`
const FILES_API_BASE_URL   = `https://generativelanguage.googleapis.com/v1beta/files`

// ─────────────────────────────────────────────────────────────────────────────
// Video Captions & Summary
// ─────────────────────────────────────────────────────────────────────────────

export type CaptionTone = 'formal' | 'sarcastic' | 'humorous-tech' | 'humorous-nontech'

export interface ToneResult {
  captions: string   // time-stamped caption lines, newline-separated
  summary: string
}

export type CaptionResults = Record<CaptionTone, ToneResult>

// Inline threshold: base64 encoding inflates size ~33%, so 75 MB raw ≈ 100 MB encoded
const INLINE_SIZE_LIMIT = 75 * 1024 * 1024 // 75 MB raw file size

const TONE_PROMPTS: Record<CaptionTone, string> = {
  formal:
    'You are a professional captioning and summarisation assistant. Write in a clear, neutral, formal register suitable for corporate or academic use. Your captions must cover the ENTIRE video from start to finish — do not skip any segment. Every caption must accurately reflect what is said or shown, including identifying each speaker by label.',
  sarcastic:
    'You are a witty, sarcastic captioning assistant. Drip every caption and the summary with dry sarcasm and sardonic commentary — but still convey the actual content accurately. Cover the ENTIRE video from start to finish without skipping any segment. Identify each speaker with sarcastic nicknames derived from their role or behaviour.',
  'humorous-tech':
    'You are a tech-savvy comedian captioning for a developer audience. Sprinkle in programming jokes, tech buzzwords used ironically, and geek humour throughout — but remain accurate. Cover the ENTIRE video from start to finish without skipping any segment. Assign each speaker a programmer-themed label (e.g. Speaker[0], 10x-dev, Legacy-Pete).',
  'humorous-nontech':
    'You are a stand-up comedian captioning for a general audience. Keep the humour accessible, punny, and light-hearted — no jargon. Make the captions and summary feel like a funny narrator at a roast. Cover the ENTIRE video from start to finish. Give each speaker a fun, punny nickname based on how they act.',
}

const CAPTION_INSTRUCTION = `
Carefully analyse the ENTIRE video from the very first frame to the very last. Do not stop early.

Your task is to produce ALL of the following for every tone:

1. TIMESTAMPED CAPTIONS — Cover every spoken word and every significant visual action.
   - Format each line as:  MM:SS – [SPEAKER_LABEL] caption text
   - If only one person speaks, use SPEAKER_1.
   - If multiple people speak, label them SPEAKER_1, SPEAKER_2, etc. consistently throughout.
   - Identify speaker changes accurately — do not mix up who said what.
   - Captions must span the full duration. One caption line per 5–10 seconds.

2. SCENE MARKERS — At every significant scene change or topic shift, insert a scene marker line:
   - Format:  MM:SS – [SCENE] Brief scene description

3. ON-SCREEN TEXT — If any text appears on screen (titles, lower thirds, slides, signs), capture it:
   - Format:  MM:SS – [TEXT] "exact on-screen text"

4. CHAPTER MARKERS — For videos longer than 2 minutes, group content into logical chapters:
   - Format:  MM:SS – [CHAPTER] Chapter title

5. SUMMARY — A thorough paragraph describing the entire video: who is in it, what happens, what is discussed, and the overall conclusion.

Return ONLY a valid JSON object — no markdown fences, no preamble, nothing outside the braces:
{
  "captions": "0:00 – [SCENE] Opening shot\\n0:00 – [SPEAKER_1] First spoken words\\n0:08 – [SPEAKER_2] Response...\\n...",
  "summary": "Thorough paragraph covering the full video from start to finish."
}

Critical rules:
- Both "captions" and "summary" are REQUIRED and must be non-empty strings.
- Captions string uses \\n between lines (escaped newline in JSON).
- Cover every second of video — never truncate or skip.
- The summary must cover the whole video, not just the start.
`.trim()

// ─────────────────────────────────────────────────────────────────────────────
// Core API helpers
// ─────────────────────────────────────────────────────────────────────────────

async function callGemini(parts: object[], systemPrompt: string, attempt = 0): Promise<string> {
  const body = {
    contents: [{ role: 'user', parts }],
    systemInstruction: { parts: [{ text: systemPrompt }] },
    generationConfig: {
      temperature: 0.4,
      maxOutputTokens: 16384, // large enough for full captions on a long video
    },
  }
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const errBody = await res.text().catch(() => '')
    if (attempt < 2 && (res.status >= 500 || res.status === 429)) {
      await new Promise(r => setTimeout(r, 1500 * (attempt + 1)))
      return callGemini(parts, systemPrompt, attempt + 1)
    }
    throw new Error(`Gemini API error ${res.status}: ${errBody}`)
  }
  const data = await res.json()
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
}

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
    // Gemini sometimes adds prose before the JSON — try to extract the object
    const jsonMatch = clean.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      try { parsed = JSON.parse(jsonMatch[0]) }
      catch { throw new Error('Gemini returned unparseable JSON. Raw: ' + raw.slice(0, 300)) }
    } else {
      throw new Error('Gemini returned no JSON object. Raw: ' + raw.slice(0, 300))
    }
  }

  const captions = typeof parsed.captions === 'string' ? parsed.captions.trim() : ''
  const summary  = typeof parsed.summary  === 'string' ? parsed.summary.trim()  : ''

  if (!summary) throw new Error('Gemini response missing summary field.')
  return { captions, summary }
}

// ─────────────────────────────────────────────────────────────────────────────
// Files API — for videos > 75 MB (inline base64 limit)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Upload a file to the Gemini Files API using resumable multipart upload.
 * Returns the file URI that can be used in subsequent generateContent calls.
 * The uploaded file is valid for 48 hours.
 */
export async function uploadToFilesAPI(
  file: File,
  onProgress?: (phase: 'uploading' | 'processing', pct?: number) => void,
): Promise<string> {
  onProgress?.('uploading', 0)

  const mimeType = file.type || 'video/mp4'
  const displayName = file.name

  // Step 1: Initiate resumable upload — get upload URL
  const initRes = await fetch(FILES_API_UPLOAD_URL, {
    method: 'POST',
    headers: {
      'X-Goog-Upload-Protocol': 'resumable',
      'X-Goog-Upload-Command': 'start',
      'X-Goog-Upload-Header-Content-Length': file.size.toString(),
      'X-Goog-Upload-Header-Content-Type': mimeType,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ file: { display_name: displayName } }),
  })

  if (!initRes.ok) {
    const err = await initRes.text().catch(() => '')
    throw new Error(`Files API init failed ${initRes.status}: ${err}`)
  }

  const uploadUrl = initRes.headers.get('X-Goog-Upload-URL')
  if (!uploadUrl) throw new Error('Files API did not return an upload URL')

  // Step 2: Upload the file in chunks with progress reporting
  const CHUNK_SIZE = 8 * 1024 * 1024 // 8 MB chunks
  let offset = 0
  let fileUri = ''

  while (offset < file.size) {
    const chunk = file.slice(offset, offset + CHUNK_SIZE)
    const isLast = offset + CHUNK_SIZE >= file.size
    const command = isLast ? 'upload, finalize' : 'upload'

    const uploadRes = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        'X-Goog-Upload-Command': command,
        'X-Goog-Upload-Offset': offset.toString(),
        'Content-Length': chunk.size.toString(),
        'Content-Type': mimeType,
      },
      body: chunk,
    })

    if (!uploadRes.ok && uploadRes.status !== 308) {
      const err = await uploadRes.text().catch(() => '')
      throw new Error(`Files API upload chunk failed ${uploadRes.status}: ${err}`)
    }

    offset += chunk.size
    onProgress?.('uploading', Math.round((offset / file.size) * 100))

    if (isLast) {
      const data = await uploadRes.json().catch(() => ({}))
      fileUri = data?.file?.uri ?? ''
    }
  }

  if (!fileUri) throw new Error('Files API upload completed but no file URI returned')

  // Step 3: Poll until the file state is ACTIVE (Gemini needs to process it)
  onProgress?.('processing')
  const fileId = fileUri.split('/').pop()!
  for (let i = 0; i < 60; i++) { // up to 5 minutes
    await new Promise(r => setTimeout(r, 5000))
    const statusRes = await fetch(`${FILES_API_BASE_URL}/${fileId}?key=${API_KEY}`)
    if (!statusRes.ok) continue
    const status = await statusRes.json()
    if (status?.state === 'ACTIVE') break
    if (status?.state === 'FAILED') throw new Error('Files API processing failed for this video.')
  }

  return fileUri
}

// ─────────────────────────────────────────────────────────────────────────────
// Per-tone generation with retry
// ─────────────────────────────────────────────────────────────────────────────

async function generateAllTones(
  videoParts: object[],
  onProgress?: (tone: CaptionTone) => void,
): Promise<CaptionResults> {
  const results = {} as CaptionResults
  for (const tone of Object.keys(TONE_PROMPTS) as CaptionTone[]) {
    onProgress?.(tone)
    const parts = [...videoParts, { text: CAPTION_INSTRUCTION }]
    let lastErr: unknown
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const raw = await callGemini(parts, TONE_PROMPTS[tone])
        results[tone] = parseToneResult(raw)
        break
      } catch (err) {
        lastErr = err
        if (attempt < 2) await new Promise(r => setTimeout(r, 1200 * (attempt + 1)))
      }
    }
    if (!results[tone]) {
      results[tone] = {
        captions: '',
        summary: `⚠️ Failed to generate ${tone} output after 3 attempts. ${lastErr instanceof Error ? lastErr.message : String(lastErr)}`,
      }
    }
  }
  return results
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Process a local video file.
 * - Files ≤ 75 MB: sent inline as base64 (fast, no pre-upload needed).
 * - Files > 75 MB: uploaded via the Files API first (supports up to 2 GB),
 *   then referenced by URI in the generate call.
 *
 * onUploadProgress is called during the Files API upload phase for large files.
 */
export async function processVideoFile(
  file: File,
  onProgress?: (tone: CaptionTone) => void,
  onUploadProgress?: (phase: 'uploading' | 'processing', pct?: number) => void,
): Promise<CaptionResults> {
  const mimeType = file.type || 'video/mp4'

  let videoParts: object[]

  if (file.size <= INLINE_SIZE_LIMIT) {
    // ── Inline path (small files) ──────────────────────────────────────────
    const arrayBuffer = await file.arrayBuffer()
    const bytes = new Uint8Array(arrayBuffer)
    let binary = ''
    const chunkSize = 8192
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize))
    }
    const base64 = btoa(binary)
    videoParts = [{ inlineData: { mimeType, data: base64 } }]
  } else {
    // ── Files API path (large files > 75 MB) ──────────────────────────────
    const fileUri = await uploadToFilesAPI(file, onUploadProgress)
    videoParts = [{ fileData: { mimeType, fileUri } }]
  }

  return generateAllTones(videoParts, onProgress)
}

/**
 * Process a publicly accessible video URL.
 * Gemini fetches the URL directly — no size limit applies here.
 */
export async function processVideoURL(
  url: string,
  onProgress?: (tone: CaptionTone) => void,
): Promise<CaptionResults> {
  const ext = url.split('?')[0].split('.').pop()?.toLowerCase() ?? ''
  const mimeMap: Record<string, string> = {
    mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime',
    avi: 'video/x-msvideo', mkv: 'video/x-matroska',
  }
  const mimeType = mimeMap[ext] ?? 'video/mp4'
  const videoParts = [{ fileData: { mimeType, fileUri: url } }]
  return generateAllTones(videoParts, onProgress)
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

// ─────────────────────────────────────────────────────────────────────────────
// Tool / function-calling support
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A single tool declaration in the Gemini format.
 * We keep this generic so appBridge can define the schemas.
 */
export interface GeminiToolDeclaration {
  name: string
  description: string
  parameters: {
    type: 'OBJECT'
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
  result: unknown   // any JSON-serialisable value
}

/**
 * sendToGeminiWithTools
 *
 * Full agentic loop:
 *   1. Send history + user message + tool declarations to Gemini.
 *   2. If Gemini responds with functionCall parts, invoke the executor for each.
 *   3. Feed the tool results back as a `function` role turn and call again.
 *   4. Repeat until Gemini sends a plain-text response (or we hit the loop cap).
 *
 * @param messages   Prior conversation messages (for multi-turn context)
 * @param userMessage The latest user message text
 * @param systemPrompt System instruction injected on every turn
 * @param tools      Array of Gemini tool declarations
 * @param executor   Async function that runs a tool call and returns its result
 * @param onToolCall Optional callback so the UI can show which tool is running
 */
export async function sendToGeminiWithTools(
  messages: Message[],
  userMessage: string,
  systemPrompt: string,
  tools: GeminiToolDeclaration[],
  executor: (call: ToolCallRequest) => Promise<unknown>,
  onToolCall?: (call: ToolCallRequest) => void,
): Promise<string> {
  // Build initial conversation history in Gemini format
  const contents: object[] = messages.map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }))
  contents.push({ role: 'user', parts: [{ text: userMessage }] })

  const MAX_ROUNDS = 10  // safety cap — prevents infinite tool loops

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const body = {
      contents,
      systemInstruction: { parts: [{ text: systemPrompt }] },
      tools: tools.length > 0 ? [{ functionDeclarations: tools }] : undefined,
      generationConfig: { temperature: 0.7, maxOutputTokens: 2048 },
    }

    const res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      const errText = await res.text().catch(() => '')
      throw new Error(`Gemini API error ${res.status}: ${errText}`)
    }

    const data = await res.json()
    const candidate = data.candidates?.[0]
    const parts: Array<{ text?: string; functionCall?: { name: string; args: Record<string, unknown> } }> =
      candidate?.content?.parts ?? []

    // Separate text parts from function-call parts
    const textParts  = parts.filter(p => typeof p.text === 'string' && p.text.trim() !== '')
    const callParts  = parts.filter(p => !!p.functionCall)

    if (callParts.length === 0) {
      // No tool calls — return the final text answer
      return textParts.map(p => p.text).join('\n').trim() || 'Done.'
    }

    // Gemini issued one or more tool calls — execute them all in parallel
    const toolResults: ToolCallResult[] = await Promise.all(
      callParts.map(async p => {
        const call: ToolCallRequest = {
          name: p.functionCall!.name,
          args: p.functionCall!.args ?? {},
        }
        onToolCall?.(call)
        let result: unknown
        try {
          result = await executor(call)
        } catch (err) {
          result = { error: err instanceof Error ? err.message : String(err) }
        }
        return { name: call.name, result }
      })
    )

    // Append the model's function-call turn to the conversation
    contents.push({ role: 'model', parts: callParts.map(p => ({ functionCall: p.functionCall })) })

    // Append the tool-result turn (Gemini expects role: "function")
    contents.push({
      role: 'function',
      parts: toolResults.map(tr => ({
        functionResponse: {
          name: tr.name,
          response: { content: tr.result },
        },
      })),
    })
    // Continue the loop so Gemini can read the results and reply
  }

  return 'I ran out of tool-call rounds. Please try again.'
}
