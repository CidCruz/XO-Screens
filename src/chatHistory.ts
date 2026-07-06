import type { ChatSession, Message } from './types'

const STORAGE_KEY = 'xo-chat-sessions'

const GREETING: Message = {
  id: '0',
  role: 'assistant',
  content: "Hey! I'm XO, your AI assistant. How can I help you today?",
  timestamp: new Date(),
}

// ── Serialisation ────────────────────────────────────────────────────────────
// Dates are stored as ISO strings in JSON; revive them on load.
function reviveMessages(messages: Message[]): Message[] {
  return messages.map(m => ({ ...m, timestamp: new Date(m.timestamp) }))
}

// ── Persistence ──────────────────────────────────────────────────────────────
export function loadSessions(): ChatSession[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed: ChatSession[] = JSON.parse(raw)
    return parsed.map(s => ({ ...s, messages: reviveMessages(s.messages) }))
  } catch {
    return []
  }
}

export function saveSessions(sessions: ChatSession[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions))
}

// ── Session factory ──────────────────────────────────────────────────────────
export function newSession(): ChatSession {
  return {
    id: Date.now().toString(),
    title: 'New Chat',
    messages: [{ ...GREETING, id: '0', timestamp: new Date() }],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
}

// ── Title generation ─────────────────────────────────────────────────────────
// Derives a short title from the first user message in a session.
export function deriveTitleFromMessage(text: string): string {
  const trimmed = text.trim().replace(/\s+/g, ' ')
  return trimmed.length > 36 ? trimmed.slice(0, 36).trimEnd() + '…' : trimmed
}

// ── Delete helper ───────────────────────────────────────────────────────────
export function deleteSession(sessions: ChatSession[], id: string): ChatSession[] {
  return sessions.filter(s => s.id !== id)
}

// ── Upsert helper ────────────────────────────────────────────────────────────
// Replaces the session with matching id, or appends if not found.
export function upsertSession(sessions: ChatSession[], updated: ChatSession): ChatSession[] {
  const idx = sessions.findIndex(s => s.id === updated.id)
  if (idx === -1) return [updated, ...sessions]
  const next = [...sessions]
  next[idx] = updated
  return next
}

// ── Initialise ───────────────────────────────────────────────────────────────
// Returns the full sessions list + the active session to open.
// If there are no saved sessions, seeds one.
export function initSessions(): { sessions: ChatSession[]; active: ChatSession } {
  const stored = loadSessions()
  if (stored.length > 0) {
    return { sessions: stored, active: stored[0] }
  }
  const first = newSession()
  saveSessions([first])
  return { sessions: [first], active: first }
}
