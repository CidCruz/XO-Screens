import type { Message } from './types'

const API_KEY = import.meta.env.VITE_GEMINI_API_KEY
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${API_KEY}`

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
