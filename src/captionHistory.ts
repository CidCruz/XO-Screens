import type { CaptionHistoryEntry } from './types'

const STORAGE_KEY = 'xo-caption-history'
const MAX_ENTRIES = 50

// ── Persistence ───────────────────────────────────────────────────────────────

export function loadCaptionHistory(): CaptionHistoryEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

export function saveCaptionHistory(entries: CaptionHistoryEntry[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries))
}

// ── Mutations ─────────────────────────────────────────────────────────────────

/** Prepend a new entry and trim to MAX_ENTRIES. Returns updated list. */
export function addCaptionHistoryEntry(
  entry: Omit<CaptionHistoryEntry, 'id' | 'createdAt'>
): CaptionHistoryEntry[] {
  const existing = loadCaptionHistory()
  const newEntry: CaptionHistoryEntry = {
    ...entry,
    id: Date.now().toString() + Math.random().toString(36).slice(2),
    createdAt: Date.now(),
  }
  const updated = [newEntry, ...existing].slice(0, MAX_ENTRIES)
  saveCaptionHistory(updated)
  return updated
}

/** Remove an entry by id. Returns updated list. */
export function deleteCaptionHistoryEntry(id: string): CaptionHistoryEntry[] {
  const updated = loadCaptionHistory().filter(e => e.id !== id)
  saveCaptionHistory(updated)
  return updated
}

/** Clear all history. */
export function clearCaptionHistory(): void {
  localStorage.removeItem(STORAGE_KEY)
}
