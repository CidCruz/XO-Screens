import { useState, useRef, useEffect, useCallback } from 'react'
import type { Message, Note, ChatSession, AppControl } from '../types'
import { sendToGeminiWithTools } from '../gemini'
import { APP_TOOLS, makeExecutor } from '../appBridge'
import {
  initSessions, newSession, upsertSession, saveSessions, deriveTitleFromMessage,
} from '../chatHistory'

// ── Capability groups ─────────────────────────────────────────────────────────

export interface CapabilityGroup {
  id: string
  label: string
  description: string
  icon: React.ReactElement
  tools: string[]   // tool names from APP_TOOLS that belong to this group
  color: string     // accent colour
}

const CAPABILITY_GROUPS: CapabilityGroup[] = [
  {
    id: 'widget_control',
    label: 'Widget Control',
    description: 'Open, close, or check which overlay widgets are visible.',
    color: 'rgba(59,130,246,0.9)',
    tools: ['open_widget', 'close_widget', 'get_open_widgets'],
    icon: (
      <svg width="13" height="13" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <rect x="3" y="3" width="7" height="7" rx="1" strokeWidth={2} />
        <rect x="14" y="3" width="7" height="7" rx="1" strokeWidth={2} />
        <rect x="3" y="14" width="7" height="7" rx="1" strokeWidth={2} />
        <rect x="14" y="14" width="7" height="7" rx="1" strokeWidth={2} />
      </svg>
    ),
  },
  {
    id: 'notes_read',
    label: 'Read Notes',
    description: 'List all notes and read their contents.',
    color: 'rgba(52,211,153,0.9)',
    tools: ['list_notes', 'get_note'],
    icon: (
      <svg width="13" height="13" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
  },
  {
    id: 'notes_write',
    label: 'Write Notes',
    description: 'Create, edit, delete, and focus notes.',
    color: 'rgba(167,139,250,0.9)',
    tools: ['create_note', 'update_note', 'delete_note', 'focus_note'],
    icon: (
      <svg width="13" height="13" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
      </svg>
    ),
  },
  {
    id: 'caption_history',
    label: 'Caption History',
    description: 'Read the video captions history.',
    color: 'rgba(245,158,11,0.9)',
    tools: ['get_caption_history'],
    icon: (
      <svg width="13" height="13" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M15 10l4.553-2.276A1 1 0 0121 8.723v6.554a1 1 0 01-1.447.894L15 14M4 8a2 2 0 012-2h9a2 2 0 012 2v8a2 2 0 01-2 2H6a2 2 0 01-2-2V8z" />
      </svg>
    ),
  },
]

const CAPS_STORAGE_KEY = 'xo-chat-capabilities'

type EnabledCaps = Record<string, boolean>

function loadCaps(): EnabledCaps {
  try {
    const raw = localStorage.getItem(CAPS_STORAGE_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch { return {} }
}

function saveCaps(caps: EnabledCaps) {
  localStorage.setItem(CAPS_STORAGE_KEY, JSON.stringify(caps))
}

function defaultCaps(): EnabledCaps {
  return Object.fromEntries(CAPABILITY_GROUPS.map(g => [g.id, true]))
}

// ── Tool-call label helpers ───────────────────────────────────────────────────

const TOOL_LABELS: Record<string, string> = {
  open_widget:         'Opening widget',
  close_widget:        'Closing widget',
  get_open_widgets:    'Checking open widgets',
  list_notes:          'Reading notes',
  get_note:            'Reading note',
  create_note:         'Creating note',
  update_note:         'Updating note',
  delete_note:         'Deleting note',
  focus_note:          'Focusing note',
  get_caption_history: 'Reading caption history',
}

function toolLabel(name: string): string {
  return TOOL_LABELS[name] ?? name.replace(/_/g, ' ')
}

// ── Corner config ─────────────────────────────────────────────────────────────

const corners = [
  { top: -6,    left: -6,   dx: -1, dy: -1, rotate: 'rotate(180deg)', cursor: 'nwse-resize' },
  { top: -6,    right: -6,  dx:  1, dy: -1, rotate: 'rotate(270deg)', cursor: 'nesw-resize' },
  { bottom: -6, left: -6,   dx: -1, dy:  1, rotate: 'rotate(90deg)',  cursor: 'nesw-resize' },
  { bottom: -6, right: -6,  dx:  1, dy:  1, rotate: 'rotate(0deg)',   cursor: 'nwse-resize' },
]

// ── Toggle switch sub-component ───────────────────────────────────────────────

function Toggle({ on, onChange, color }: { on: boolean; onChange: (v: boolean) => void; color: string }) {
  return (
    <button
      data-no-drag
      onClick={() => onChange(!on)}
      style={{
        width: 32, height: 18, borderRadius: 99, border: 'none', cursor: 'pointer',
        background: on ? color.replace('0.9', '0.7') : 'rgba(255,255,255,0.1)',
        position: 'relative', flexShrink: 0,
        transition: 'background 0.2s',
        boxShadow: on ? `0 0 8px ${color.replace('0.9', '0.35')}` : 'none',
      }}
    >
      <span style={{
        position: 'absolute', top: 2, left: on ? 16 : 2,
        width: 14, height: 14, borderRadius: '50%',
        background: on ? '#fff' : 'rgba(255,255,255,0.4)',
        transition: 'left 0.2s, background 0.2s',
        display: 'block',
      }} />
    </button>
  )
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  onClose?: () => void
  onCornerDown: (e: React.MouseEvent, dx: number, dy: number) => void
  activeNote?: Note | null
  appControl?: AppControl
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function timeAgo(ts: number) {
  const d = Date.now() - ts
  if (d < 60_000) return 'just now'
  if (d < 3_600_000) return `${Math.floor(d / 60_000)}m ago`
  if (d < 86_400_000) return `${Math.floor(d / 3_600_000)}h ago`
  return `${Math.floor(d / 86_400_000)}d ago`
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ChatBox({ onCornerDown, activeNote, appControl }: Props) {
  const [sessions, setSessions]           = useState<ChatSession[]>(() => initSessions().sessions)
  const [activeId, setActiveId]           = useState<string>(() => initSessions().active.id)
  const [historyOpen, setHistoryOpen]     = useState(false)
  const [settingsOpen, setSettingsOpen]   = useState(false)
  const [input, setInput]                 = useState('')
  const [loading, setLoading]             = useState(false)
  const [activeTools, setActiveTools]     = useState<string[]>([])
  const [closestCorner, setClosestCorner] = useState<number | null>(null)
  const [enabledCaps, setEnabledCaps]     = useState<EnabledCaps>(() => {
    const stored = loadCaps()
    // Fill in any missing keys with true (default on)
    return { ...defaultCaps(), ...stored }
  })

  const containerRef = useRef<HTMLDivElement>(null)
  const bottomRef    = useRef<HTMLDivElement>(null)
  const textareaRef  = useRef<HTMLTextAreaElement>(null)

  const activeSession  = sessions.find(s => s.id === activeId) ?? sessions[0]
  const messages: Message[] = activeSession?.messages ?? []

  // Derive active tool set from enabled capabilities
  const enabledToolNames = new Set(
    CAPABILITY_GROUPS.filter(g => enabledCaps[g.id]).flatMap(g => g.tools)
  )
  const activeAppTools = APP_TOOLS.filter(t => enabledToolNames.has(t.name))
  const enabledGroupCount = CAPABILITY_GROUPS.filter(g => enabledCaps[g.id]).length

  const executorRef = useRef<ReturnType<typeof makeExecutor> | null>(null)
  useEffect(() => {
    executorRef.current = appControl ? makeExecutor(appControl) : null
  }, [appControl])

  useEffect(() => { saveSessions(sessions) }, [sessions])
  useEffect(() => { saveCaps(enabledCaps) }, [enabledCaps])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading, activeTools])

  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`
    el.style.overflowY = el.scrollHeight > 120 ? 'auto' : 'hidden'
  }, [input])

  function toggleCap(id: string, val: boolean) {
    setEnabledCaps(prev => ({ ...prev, [id]: val }))
  }

  function handleNewChat() {
    const session = newSession()
    setSessions(prev => [session, ...prev])
    setActiveId(session.id)
    setHistoryOpen(false)
    setSettingsOpen(false)
    setInput('')
  }

  function handleSelectSession(id: string) {
    setActiveId(id)
    setHistoryOpen(false)
    setSettingsOpen(false)
    setInput('')
  }

  // ── Send ────────────────────────────────────────────────────────────────────

  const handleSend = useCallback(async () => {
    const text = input.trim()
    if (!text || loading) return

    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: text,
      timestamp: new Date(),
    }

    const isFirstUserMsg = messages.filter(m => m.role === 'user').length === 0
    const newTitle = isFirstUserMsg ? deriveTitleFromMessage(text) : activeSession.title
    const updatedMessages = [...messages, userMsg]

    setSessions(prev => upsertSession(prev, {
      ...activeSession,
      title: newTitle,
      messages: updatedMessages,
      updatedAt: Date.now(),
    }))

    setInput('')
    setLoading(true)
    setActiveTools([])
    if (textareaRef.current) textareaRef.current.style.height = 'auto'

    try {
      const noteCtx = activeNote
        ? `The user has a note open titled "${activeNote.title || 'Untitled'}" with content:\n"""\n${activeNote.content || '(empty)'}\n"""\nYou can reference it or edit it using the update_note tool (if write access is enabled).`
        : ''

      // Describe which capabilities are actually available this turn
      const capLines = CAPABILITY_GROUPS
        .filter(g => enabledCaps[g.id])
        .map(g => `- ${g.label}: ${g.description}`)
        .join('\n')

      const toolsAvailable = appControl && activeAppTools.length > 0
        ? `You have access to the following XO Screens capabilities:\n${capLines}\nUse tools proactively when the user asks you to do something in the app. After taking actions, summarise what you did briefly.`
        : appControl
          ? 'All app-control capabilities are currently disabled by the user. You can still chat normally.'
          : ''

      const systemPrompt = [
        'You are XO, an intelligent desktop AI assistant embedded in the XO Screens overlay app. Be concise, helpful, and friendly.',
        toolsAvailable,
        noteCtx,
      ].filter(Boolean).join('\n\n')

      let reply: string
      if (appControl && executorRef.current && activeAppTools.length > 0) {
        reply = await sendToGeminiWithTools(
          updatedMessages, text, systemPrompt,
          activeAppTools,
          executorRef.current,
          (call) => { setActiveTools(prev => [...prev, call.name]) },
        )
      } else {
        const { sendToGeminiWithSystem } = await import('../gemini')
        reply = await sendToGeminiWithSystem(updatedMessages, text, systemPrompt)
      }

      setActiveTools([])
      setSessions(prev => upsertSession(prev, {
        ...activeSession,
        title: newTitle,
        messages: [...updatedMessages, { id: Date.now().toString(), role: 'assistant', content: reply, timestamp: new Date() }],
        updatedAt: Date.now(),
      }))
    } catch (err) {
      setActiveTools([])
      setSessions(prev => upsertSession(prev, {
        ...activeSession,
        title: newTitle ?? activeSession.title,
        messages: [...updatedMessages, {
          id: Date.now().toString(), role: 'assistant',
          content: `⚠️ ${err instanceof Error ? err.message : 'Failed to reach Fireworks AI. Check your API key.'}`,
          timestamp: new Date(),
        }],
        updatedAt: Date.now(),
      }))
    } finally {
      setLoading(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [input, loading, messages, activeSession, activeNote, appControl, enabledCaps, activeAppTools])

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div
      ref={containerRef}
      style={{ position: 'relative', overflow: 'visible' }}
      onMouseMove={e => {
        if (!containerRef.current) return
        const r = containerRef.current.getBoundingClientRect()
        const x = e.clientX - r.left, y = e.clientY - r.top
        const pts = [{ cx: 0, cy: 0 }, { cx: r.width, cy: 0 }, { cx: 0, cy: r.height }, { cx: r.width, cy: r.height }]
        let closest = -1, minDist = 14
        pts.forEach((p, i) => { const d = Math.hypot(x - p.cx, y - p.cy); if (d < minDist) { minDist = d; closest = i } })
        setClosestCorner(closest)
      }}
      onMouseLeave={() => setClosestCorner(null)}
    >
      {/* Corner handles */}
      {corners.map((c, i) => (
        <div key={i} onMouseDown={e => onCornerDown(e, c.dx, c.dy)} style={{
          position: 'absolute', width: 16, height: 16, zIndex: 10,
          top: (c as { top?: number }).top, left: (c as { left?: number }).left,
          right: (c as { right?: number }).right, bottom: (c as { bottom?: number }).bottom,
          cursor: c.cursor, display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <svg width="10" height="10" viewBox="0 0 10 10"
            style={{ opacity: closestCorner === i ? 0.35 : 0, transition: 'opacity 0.15s', pointerEvents: 'none', transform: c.rotate }}>
            <line x1="9" y1="3" x2="3" y2="9" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
            <line x1="9" y1="6" x2="6" y2="9" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </div>
      ))}

      {/* Chat panel */}
      <div style={{
        width: 320, height: 480, display: 'flex', flexDirection: 'column',
        background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(24px) saturate(200%)',
        WebkitBackdropFilter: 'blur(24px) saturate(200%)',
        border: '1px solid rgba(255,255,255,0.1)', borderRadius: 20,
        overflow: 'hidden', boxShadow: '0 24px 60px rgba(0,0,0,0.5)',
        position: 'relative',
      }}>

        {/* ── History drawer ── */}
        {historyOpen && (
          <div style={{
            position: 'absolute', inset: 0, zIndex: 20,
            background: 'rgba(0,0,0,0.88)', backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)', display: 'flex', flexDirection: 'column',
            borderRadius: 20, overflow: 'hidden', animation: 'fadeIn 0.15s ease',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderBottom: '1px solid rgba(255,255,255,0.08)', flexShrink: 0 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>Chat History</span>
              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={handleNewChat} title="New chat"
                  style={{ height: 28, padding: '0 10px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.08)', color: '#fff', fontSize: 11, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, transition: 'all 0.15s' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.14)' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.08)' }}
                >
                  <svg width="10" height="10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" /></svg>
                  New chat
                </button>
                <button onClick={() => setHistoryOpen(false)}
                  style={{ width: 28, height: 28, borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.5)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.1)' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.05)' }}
                >
                  <svg width="12" height="12" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
              {sessions.length === 0 && <div style={{ padding: '20px 12px', textAlign: 'center', fontSize: 12, color: 'rgba(255,255,255,0.3)' }}>No chats yet.</div>}
              {sessions.map(s => (
                <button key={s.id} onClick={() => handleSelectSession(s.id)}
                  style={{ width: '100%', textAlign: 'left', padding: '10px 12px', borderRadius: 10, background: s.id === activeId ? 'rgba(255,255,255,0.08)' : 'transparent', border: s.id === activeId ? '1px solid rgba(255,255,255,0.12)' : '1px solid transparent', cursor: 'pointer', transition: 'all 0.15s', marginBottom: 2 }}
                  onMouseEnter={e => { if (s.id !== activeId) (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.05)' }}
                  onMouseLeave={e => { if (s.id !== activeId) (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
                >
                  <div style={{ fontSize: 12, fontWeight: s.id === activeId ? 600 : 400, color: s.id === activeId ? '#fff' : 'rgba(255,255,255,0.6)', marginBottom: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.title}</div>
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)' }}>{s.messages.filter(m => m.role === 'user').length} message{s.messages.filter(m => m.role === 'user').length !== 1 ? 's' : ''} · {timeAgo(s.updatedAt)}</div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── Capabilities / Settings drawer ── */}
        {settingsOpen && (
          <div style={{
            position: 'absolute', inset: 0, zIndex: 20,
            background: 'rgba(0,0,0,0.92)', backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)', display: 'flex', flexDirection: 'column',
            borderRadius: 20, overflow: 'hidden', animation: 'fadeIn 0.15s ease',
          }}>
            {/* Drawer header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '14px 16px', borderBottom: '1px solid rgba(255,255,255,0.08)', flexShrink: 0 }}>
              <svg width="13" height="13" fill="none" stroke="rgba(255,255,255,0.5)" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="3" strokeWidth={2} />
                <path strokeWidth={2} strokeLinecap="round" d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
              </svg>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#fff', flex: 1 }}>Chat Capabilities</span>
              <button data-no-drag onClick={() => setSettingsOpen(false)}
                style={{ width: 28, height: 28, borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.5)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s' }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.1)' }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.05)' }}
              >
                <svg width="12" height="12" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            {/* Description */}
            <div style={{ padding: '12px 16px 4px', flexShrink: 0 }}>
              <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', lineHeight: 1.6, margin: 0 }}>
                Control what XO can do inside this app. Disabled capabilities are never sent to the AI.
              </p>
            </div>

            {/* Capability rows */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '8px 12px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
              {CAPABILITY_GROUPS.map(group => {
                const isOn = !!enabledCaps[group.id]
                return (
                  <div key={group.id} style={{
                    display: 'flex', alignItems: 'center', gap: 12, padding: '11px 13px', borderRadius: 12,
                    background: isOn ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.02)',
                    border: `1px solid ${isOn ? group.color.replace('0.9', '0.18') : 'rgba(255,255,255,0.06)'}`,
                    transition: 'all 0.2s',
                  }}>
                    {/* Icon */}
                    <div style={{
                      width: 30, height: 30, borderRadius: 8, flexShrink: 0,
                      background: isOn ? group.color.replace('0.9', '0.12') : 'rgba(255,255,255,0.05)',
                      border: `1px solid ${isOn ? group.color.replace('0.9', '0.25') : 'rgba(255,255,255,0.08)'}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: isOn ? group.color : 'rgba(255,255,255,0.25)',
                      transition: 'all 0.2s',
                    }}>
                      {group.icon}
                    </div>
                    {/* Text */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: isOn ? '#fff' : 'rgba(255,255,255,0.4)', marginBottom: 2, transition: 'color 0.2s' }}>
                        {group.label}
                      </div>
                      <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.28)', lineHeight: 1.4 }}>
                        {group.description}
                      </div>
                    </div>
                    {/* Toggle */}
                    <Toggle on={isOn} onChange={v => toggleCap(group.id, v)} color={group.color} />
                  </div>
                )
              })}
            </div>

            {/* Footer — enable all / disable all */}
            <div style={{ padding: '10px 12px 14px', borderTop: '1px solid rgba(255,255,255,0.07)', display: 'flex', gap: 8, flexShrink: 0 }}>
              <button data-no-drag onClick={() => setEnabledCaps(defaultCaps())}
                style={{ flex: 1, padding: '8px', borderRadius: 9, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.5)', fontSize: 11, fontWeight: 500, fontFamily: 'inherit', cursor: 'pointer', transition: 'all 0.15s' }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.1)'; (e.currentTarget as HTMLButtonElement).style.color = '#fff' }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.05)'; (e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.5)' }}
              >Enable all</button>
              <button data-no-drag onClick={() => setEnabledCaps(Object.fromEntries(CAPABILITY_GROUPS.map(g => [g.id, false])))}
                style={{ flex: 1, padding: '8px', borderRadius: 9, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.5)', fontSize: 11, fontWeight: 500, fontFamily: 'inherit', cursor: 'pointer', transition: 'all 0.15s' }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.1)'; (e.currentTarget as HTMLButtonElement).style.color = '#fff' }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.05)'; (e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.5)' }}
              >Disable all</button>
            </div>
          </div>
        )}

        {/* ── Header ── */}
        <div data-reset-widget style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderBottom: '1px solid rgba(255,255,255,0.08)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ color: '#fff', fontWeight: 900, fontSize: 14, letterSpacing: '-0.02em', textShadow: '0 0 12px rgba(255,255,255,0.9), 0 0 24px rgba(255,255,255,0.5)' }}>XO</span>
            <span style={{ color: 'rgba(255,255,255,0.25)', fontSize: 11, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {activeSession?.title ?? 'Assistant'}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            {/* New chat */}
            <button data-no-drag onClick={handleNewChat} title="New chat"
              style={{ width: 28, height: 28, borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.45)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s' }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.1)'; (e.currentTarget as HTMLButtonElement).style.color = '#fff' }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.05)'; (e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.45)' }}
            >
              <svg width="12" height="12" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" /></svg>
            </button>
            {/* History */}
            <button data-no-drag onClick={() => { setHistoryOpen(true); setSettingsOpen(false) }} title="Chat history"
              style={{ width: 28, height: 28, borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.45)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s' }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.1)'; (e.currentTarget as HTMLButtonElement).style.color = '#fff' }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.05)'; (e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.45)' }}
            >
              <svg width="13" height="13" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            </button>
            {/* Capabilities settings icon */}
            <button data-no-drag onClick={() => { setSettingsOpen(v => !v); setHistoryOpen(false) }} title="Chat capabilities"
              style={{ width: 28, height: 28, borderRadius: 8, border: `1px solid ${settingsOpen ? 'rgba(167,139,250,0.4)' : 'rgba(255,255,255,0.1)'}`, background: settingsOpen ? 'rgba(167,139,250,0.15)' : 'rgba(255,255,255,0.05)', color: settingsOpen ? 'rgba(167,139,250,0.9)' : 'rgba(255,255,255,0.45)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s' }}
              onMouseEnter={e => { if (!settingsOpen) { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.1)'; (e.currentTarget as HTMLButtonElement).style.color = '#fff' } }}
              onMouseLeave={e => { if (!settingsOpen) { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.05)'; (e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.45)' } }}
            >
              <svg width="13" height="13" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="3" strokeWidth={2} />
                <path strokeWidth={2} strokeLinecap="round" d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
              </svg>
            </button>
            {/* Status dot */}
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: activeTools.length > 0 ? '#a78bfa' : '#34d399', display: 'inline-block', transition: 'background 0.3s', boxShadow: activeTools.length > 0 ? '0 0 6px rgba(167,139,250,0.8)' : 'none' }} />
          </div>
        </div>

        {/* ── Messages ── */}
        <div className="chat-scroll" style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {messages.map(msg => (
            <div key={msg.id} className="fade-in" style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
              <div style={{
                maxWidth: '78%', padding: '9px 13px', borderRadius: 14, fontSize: 12, lineHeight: 1.6,
                wordBreak: 'break-word', whiteSpace: 'pre-wrap',
                ...(msg.role === 'user'
                  ? { background: 'rgba(255,255,255,0.1)', color: '#fff', border: '1px solid rgba(255,255,255,0.1)' }
                  : { color: 'rgba(255,255,255,0.7)' }),
              }}>
                {msg.content}
              </div>
            </div>
          ))}

          {/* Loading — tool activity pills + typing dots */}
          {loading && (
            <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-start' }}>
              {activeTools.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {activeTools.slice(-3).map((name, i) => (
                    <div key={`${name}-${i}`} className="fade-in" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 10px', borderRadius: 20, background: 'rgba(167,139,250,0.1)', border: '1px solid rgba(167,139,250,0.2)', width: 'fit-content' }}>
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="rgba(167,139,250,0.9)" strokeWidth={2.5} style={{ animation: 'spin 0.8s linear infinite', flexShrink: 0 }}>
                        <path strokeLinecap="round" d="M12 2a10 10 0 0 1 10 10" opacity={0.9} />
                        <path strokeLinecap="round" d="M12 2a10 10 0 0 0-10 10" opacity={0.25} />
                      </svg>
                      <span style={{ fontSize: 10, color: 'rgba(167,139,250,0.85)', fontWeight: 500, whiteSpace: 'nowrap' }}>{toolLabel(name)}…</span>
                    </div>
                  ))}
                </div>
              )}
              <div style={{ display: 'flex', gap: 4, alignItems: 'center', padding: '4px 4px' }}>
                {[0, 150, 300].map(delay => (
                  <span key={delay} className="animate-bounce" style={{ width: 4, height: 4, borderRadius: '50%', background: 'rgba(255,255,255,0.35)', display: 'inline-block', animationDelay: `${delay}ms` }} />
                ))}
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* ── Input ── */}
        <div style={{ padding: '12px 16px', borderTop: '1px solid rgba(255,255,255,0.08)', flexShrink: 0 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
            <textarea
              ref={textareaRef} data-no-drag
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
              placeholder={
                !appControl ? 'Ask anything…'
                : enabledGroupCount === 0 ? 'Capabilities disabled — chat only'
                : 'Ask me to control the app…'
              }
              rows={1}
              className="chat-textarea"
              style={{ flex: 1, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, padding: '9px 13px', color: '#fff', fontSize: 12, outline: 'none', resize: 'none', maxHeight: 120, fontFamily: 'inherit', overflowY: 'hidden', lineHeight: 1.5, boxSizing: 'border-box' }}
            />
            <button data-no-drag onClick={handleSend} disabled={loading || !input.trim()}
              style={{ minHeight: 36, width: 42, borderRadius: 10, border: '1px solid rgba(255,255,255,0.1)', background: '#fff', color: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0, transition: 'all 0.15s', alignSelf: 'flex-end', opacity: (loading || !input.trim()) ? 0.3 : 1, pointerEvents: 'auto' }}
            >
              <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24" style={{ transform: 'rotate(-45deg)' }}>
                <path d="M2 21l21-9L2 3v7l15 2-15 2z" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
