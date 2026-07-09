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
  pinned?: boolean
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
}

export interface CaptionHistoryEntry {
  id: string
  label: string          // filename or URL
  createdAt: number
  results: Record<string, CaptionToneResult>
}

// ── App Control (tool-calling) ───────────────────────────────────────────────

export type WidgetId = 'chat' | 'notes' | 'video' | 'settings' | 'usage'

export interface AppControl {
  // Widget visibility
  openWidget:  (id: WidgetId) => void
  closeWidget: (id: WidgetId) => void
  getOpenWidgets: () => WidgetId[]

  // Notes CRUD
  listNotes:   () => Note[]
  getNote:     (id: string) => Note | undefined
  createNote:  (title: string, content: string) => Note
  updateNote:  (id: string, patch: Partial<Pick<Note, 'title' | 'content' | 'color'>>) => Note | null
  deleteNote:  (id: string) => boolean
  focusNote:   (id: string) => void  // makes a note the active one in the Notes widget

  // Video captions
  getCaptionHistory: () => CaptionHistoryEntry[]
}
