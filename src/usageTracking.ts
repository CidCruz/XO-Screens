/**
 * Usage Tracking
 * 
 * Tracks user interactions across all features:
 * - Chat messages sent/received
 * - Notes created/edited/deleted
 * - Video captions generated
 * - Session duration
 * - Feature usage patterns
 */

export interface UsageStats {
  // Chat metrics
  chatMessagesUser: number
  chatMessagesAI: number
  chatSessions: number
  chatToolCalls: number
  
  // Notes metrics
  notesCreated: number
  notesEdited: number
  notesDeleted: number
  notesWordCount: number
  
  // Video metrics
  videoCaptionsGenerated: number
  videoFilesProcessed: number
  
  // Session metrics
  totalSessions: number
  totalTimeSpent: number // milliseconds
  lastSessionDate: number
  firstSessionDate: number
  
  // Feature usage
  featuresUsed: {
    chat: number
    notes: number
    video: number
    settings: number
  }
  
  // Daily breakdown (last 30 days)
  dailyStats: DailyStat[]
}

export interface DailyStat {
  date: string // YYYY-MM-DD
  messages: number
  notes: number
  captions: number
  timeSpent: number // milliseconds
}

export interface SessionInfo {
  id: string
  startTime: number
  endTime?: number
  duration?: number // milliseconds
  interactions: number
}

const STORAGE_KEY = 'xo-usage-stats'
const SESSION_KEY = 'xo-current-session'
const SESSION_TIMEOUT = 30 * 60 * 1000 // 30 minutes

// ── Default stats ─────────────────────────────────────────────────────────────

function createDefaultStats(): UsageStats {
  const now = Date.now()
  return {
    chatMessagesUser: 0,
    chatMessagesAI: 0,
    chatSessions: 0,
    chatToolCalls: 0,
    notesCreated: 0,
    notesEdited: 0,
    notesDeleted: 0,
    notesWordCount: 0,
    videoCaptionsGenerated: 0,
    videoFilesProcessed: 0,
    totalSessions: 0,
    totalTimeSpent: 0,
    lastSessionDate: now,
    firstSessionDate: now,
    featuresUsed: {
      chat: 0,
      notes: 0,
      video: 0,
      settings: 0,
    },
    dailyStats: [],
  }
}

// ── Persistence ───────────────────────────────────────────────────────────────

export function loadUsageStats(): UsageStats {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return createDefaultStats()
    const parsed = JSON.parse(raw) as UsageStats
    // Ensure all fields exist (for backward compatibility)
    return { ...createDefaultStats(), ...parsed }
  } catch {
    return createDefaultStats()
  }
}

export function saveUsageStats(stats: UsageStats): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(stats))
  window.dispatchEvent(new CustomEvent('xo-usage-updated'))
}

// ── Session management ────────────────────────────────────────────────────────

export function getCurrentSession(): SessionInfo | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    if (!raw) return null
    const session = JSON.parse(raw) as SessionInfo
    // Check if session timed out
    if (Date.now() - session.startTime > SESSION_TIMEOUT) {
      endCurrentSession()
      return null
    }
    return session
  } catch {
    return null
  }
}

export function startNewSession(): SessionInfo {
  // If a valid session already exists, return it without bumping totalSessions
  const existing = getCurrentSession()
  if (existing) return existing

  const session: SessionInfo = {
    id: Date.now().toString() + Math.random().toString(36).slice(2),
    startTime: Date.now(),
    interactions: 0,
  }
  localStorage.setItem(SESSION_KEY, JSON.stringify(session))
  
  // Update stats
  const stats = loadUsageStats()
  stats.totalSessions += 1
  stats.lastSessionDate = session.startTime
  saveUsageStats(stats)
  
  return session
}

export function endCurrentSession(): void {
  const session = getCurrentSession()
  if (!session) return
  
  const endTime = Date.now()
  const duration = endTime - session.startTime
  
  // Update stats
  const stats = loadUsageStats()
  stats.totalTimeSpent += duration
  saveUsageStats(stats)
  
  localStorage.removeItem(SESSION_KEY)
}

export function recordInteraction(): void {
  let session = getCurrentSession()
  if (!session) {
    session = startNewSession()
  }
  session.interactions += 1
  localStorage.setItem(SESSION_KEY, JSON.stringify(session))
}

// ── Daily stats helpers ───────────────────────────────────────────────────────

function getTodayKey(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

function ensureTodayStat(stats: UsageStats): DailyStat {
  const today = getTodayKey()
  let todayStat = stats.dailyStats.find(s => s.date === today)
  
  if (!todayStat) {
    todayStat = {
      date: today,
      messages: 0,
      notes: 0,
      captions: 0,
      timeSpent: 0,
    }
    stats.dailyStats.unshift(todayStat)
    // Keep only last 30 days
    stats.dailyStats = stats.dailyStats.slice(0, 30)
  }
  
  return todayStat
}

// ── Tracking functions ────────────────────────────────────────────────────────

export function trackChatMessage(role: 'user' | 'assistant', isToolCall = false): void {
  recordInteraction()
  const stats = loadUsageStats()
  const todayStat = ensureTodayStat(stats)
  
  if (role === 'user') {
    stats.chatMessagesUser += 1
    todayStat.messages += 1
    stats.featuresUsed.chat += 1
  } else {
    stats.chatMessagesAI += 1
    if (isToolCall) {
      stats.chatToolCalls += 1
    }
  }
  
  saveUsageStats(stats)
}

export function trackChatSession(): void {
  const stats = loadUsageStats()
  stats.chatSessions += 1
  saveUsageStats(stats)
}

export function trackNoteCreated(wordCount: number): void {
  recordInteraction()
  const stats = loadUsageStats()
  const todayStat = ensureTodayStat(stats)
  
  stats.notesCreated += 1
  stats.notesWordCount += wordCount
  todayStat.notes += 1
  stats.featuresUsed.notes += 1
  
  saveUsageStats(stats)
}

export function trackNoteEdited(oldWordCount: number, newWordCount: number): void {
  recordInteraction()
  const stats = loadUsageStats()
  
  stats.notesEdited += 1
  stats.notesWordCount += (newWordCount - oldWordCount)
  stats.featuresUsed.notes += 1
  
  saveUsageStats(stats)
}

export function trackNoteDeleted(wordCount: number): void {
  recordInteraction()
  const stats = loadUsageStats()
  
  stats.notesDeleted += 1
  stats.notesWordCount -= wordCount
  stats.featuresUsed.notes += 1
  
  saveUsageStats(stats)
}

export function trackVideoCaptionGenerated(): void {
  recordInteraction()
  const stats = loadUsageStats()
  const todayStat = ensureTodayStat(stats)
  
  stats.videoCaptionsGenerated += 1
  todayStat.captions += 1
  stats.featuresUsed.video += 1
  
  saveUsageStats(stats)
}

export function trackVideoFileProcessed(): void {
  const stats = loadUsageStats()
  stats.videoFilesProcessed += 1
  saveUsageStats(stats)
}

export function trackFeatureUsage(feature: 'chat' | 'notes' | 'video' | 'settings'): void {
  recordInteraction()
  const stats = loadUsageStats()
  stats.featuresUsed[feature] += 1
  saveUsageStats(stats)
}

export function trackSessionTime(duration: number): void {
  const stats = loadUsageStats()
  const todayStat = ensureTodayStat(stats)
  
  stats.totalTimeSpent += duration
  todayStat.timeSpent += duration
  
  saveUsageStats(stats)
}

// ── Export functions ──────────────────────────────────────────────────────────

export function exportUsageData(): string {
  const stats = loadUsageStats()
  return JSON.stringify(stats, null, 2)
}

export function clearUsageData(): void {
  localStorage.removeItem(STORAGE_KEY)
  localStorage.removeItem(SESSION_KEY)
  window.dispatchEvent(new CustomEvent('xo-usage-updated'))
}

// ── Analytics calculations ────────────────────────────────────────────────────

export function calculateAverages(stats: UsageStats) {
  const days = stats.dailyStats.length || 1
  const sessions = stats.totalSessions || 1
  
  return {
    avgMessagesPerDay: Math.round(stats.chatMessagesUser / days),
    avgNotesPerDay: Math.round(stats.notesCreated / days),
    avgCaptionsPerDay: Math.round(stats.videoCaptionsGenerated / days),
    avgTimePerSession: Math.round(stats.totalTimeSpent / sessions),
    avgInteractionsPerSession: Math.round(
      (stats.chatMessagesUser + stats.notesCreated + stats.videoCaptionsGenerated) / sessions
    ),
  }
}

export function getMostUsedFeature(stats: UsageStats): string {
  const features = stats.featuresUsed
  const max = Math.max(features.chat, features.notes, features.video, features.settings)
  
  if (features.chat === max) return 'chat'
  if (features.notes === max) return 'notes'
  if (features.video === max) return 'video'
  return 'settings'
}

export function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  
  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`
  }
  return `${seconds}s`
}
