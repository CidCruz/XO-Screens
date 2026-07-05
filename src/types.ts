export interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
}

export interface AppItem {
  id: string
  label: string
}

export interface Note {
  id: string
  title: string
  content: string
  color: string
  createdAt: number
  updatedAt: number
}

export interface ChatSession {
  id: string
  title: string          // auto-generated from first user message
  messages: Message[]
  createdAt: number
  updatedAt: number
}

export interface CaptionToneResult {
  summary: string
  captions: string
}

export interface CaptionHistoryEntry {
  id: string
  label: string          // filename or URL
  createdAt: number
  results: Record<string, CaptionToneResult>
}
