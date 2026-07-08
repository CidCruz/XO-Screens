import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import type { AppItem, Note, AppControl } from './types'
import { APP_TOOLS, makeExecutor } from './appBridge'
import { sendToGeminiWithTools, sendToGeminiWithSystem } from './gemini'
import type { ToolCallRequest } from './fireworks'

/* ── Nav items ────────────────────────────────────────────────────────────── */
const APPS: AppItem[] = [
  { id: 'home',     label: 'Home'            },
  { id: 'chat',     label: 'Assistant'       },
  { id: 'notes',    label: 'Notes'           },
  { id: 'video',    label: 'Video Summarizer'  },
  { id: 'usage',    label: 'Usage Tracking'  },
  { id: 'settings', label: 'Settings'        },
]

/* ── Icon helper ──────────────────────────────────────────────────────────── */
function NavIcon({ id }: { id: string }) {
  const s = 'width:20px;height:20px'
  switch (id) {
    case 'home':
      return (
        <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
            d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
        </svg>
      )
    case 'chat':
      return (
        <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
            d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-4 4v-4z" />
        </svg>
      )
    case 'notes':
      return (
        <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
            d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
        </svg>
      )
    case 'settings':
      return (
        <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
            d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      )
    case 'video':
      return (
        <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
            d="M15 10l4.553-2.276A1 1 0 0121 8.723v6.554a1 1 0 01-1.447.894L15 14M4 8a2 2 0 012-2h9a2 2 0 012 2v8a2 2 0 01-2 2H6a2 2 0 01-2-2V8z" />
        </svg>
      )
    case 'usage':
      return (
        <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
            d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
      )
    default: return null
  }
  void s
}

/* ── Sidebar ──────────────────────────────────────────────────────────────── */
interface SidebarProps {
  activeId: string
  onSelect: (id: string) => void
}

function Sidebar({ activeId, onSelect }: SidebarProps) {
  return (
    <aside className="web-sidebar">
      {/* Logo */}
      <div style={{
        marginBottom: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexDirection: 'column', gap: 2,
      }}>
        <span style={{
          color: '#fff', fontWeight: 900, fontSize: 16, letterSpacing: '-0.03em',
          textShadow: '0 0 14px rgba(255,255,255,0.9), 0 0 30px rgba(255,255,255,0.4)',
          fontFamily: '"Montserrat", sans-serif',
        }}>XO</span>
      </div>

      {/* Nav */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1, width: '100%', alignItems: 'center' }}>
        {APPS.map(app => (
          <div key={app.id} style={{ position: 'relative' }}>
            <button
              className={`web-nav-item${activeId === app.id ? ' active' : ''}`}
              onClick={() => onSelect(app.id)}
              title={app.label}
            >
              <NavIcon id={app.id} />
              <span className="web-tooltip">{app.label}</span>
            </button>
          </div>
        ))}
      </div>

      {/* Bottom: status dot */}
      <div style={{ marginTop: 'auto', paddingBottom: 4, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
        <div style={{
          width: 6, height: 6, borderRadius: '50%', background: '#34d399',
          boxShadow: '0 0 6px rgba(52,211,153,0.6)',
        }} />
      </div>
    </aside>
  )
}

/* ── Home / welcome panel ─────────────────────────────────────────────────── */
function HomePanel({ onNavigate }: { onNavigate: (id: string) => void }) {
  const cards = [
    {
      id: 'chat',
      icon: (
        <svg width="22" height="22" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
            d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-4 4v-4z" />
        </svg>
      ),
      title: 'AI Assistant',
      desc: 'Chat with XO — powered by Fireworks AI (Gemma 4).',
      accent: 'rgba(99,102,241,0.15)',
      border: 'rgba(99,102,241,0.25)',
      dot: 'rgba(99,102,241,0.9)',
    },
    {
      id: 'notes',
      icon: (
        <svg width="22" height="22" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
            d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
        </svg>
      ),
      title: 'Quick Notes',
      desc: 'Capture ideas instantly with color-coded notes.',
      accent: 'rgba(52,211,153,0.12)',
      border: 'rgba(52,211,153,0.22)',
      dot: 'rgba(52,211,153,0.9)',
    },
    {
      id: 'video',
      icon: (
        <svg width="22" height="22" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
            d="M15 10l4.553-2.276A1 1 0 0121 8.723v6.554a1 1 0 01-1.447.894L15 14M4 8a2 2 0 012-2h9a2 2 0 012 2v8a2 2 0 01-2 2H6a2 2 0 01-2-2V8z" />
        </svg>
      ),
      title: 'Video Summarizer',
      desc: 'Upload a video or paste a URL — get summaries in 4 tones.',
      accent: 'rgba(139,92,246,0.12)',
      border: 'rgba(139,92,246,0.22)',
      dot: 'rgba(139,92,246,0.9)',
    },
  ]

  return (
    <div className="web-panel-main" style={{ justifyContent: 'center', alignItems: 'center' }}>
      <div style={{ maxWidth: 480, width: '100%', padding: '0 32px', animation: 'fadeIn 0.4s ease both' }}>
        {/* Hero */}
        <div style={{ marginBottom: 40 }}>
          <div style={{ marginBottom: 16 }}>
            <span className="web-hero-badge">
              <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#34d399', display: 'inline-block' }} />
              Web App
            </span>
          </div>
          <h1 style={{
            fontSize: 42, fontWeight: 900, letterSpacing: '-0.04em', lineHeight: 1.1,
            fontFamily: '"Montserrat", sans-serif',
            background: 'linear-gradient(135deg, #fff 0%, rgba(255,255,255,0.55) 100%)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
            marginBottom: 14,
          }}>XO Screens.</h1>
          <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: 14, lineHeight: 1.7, maxWidth: 360 }}>
            Your AI-powered productivity workspace. Chat, take notes, and stay in flow — right in your browser.
          </p>
        </div>

        {/* Cards */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {cards.map(c => (
            <button
              key={c.id}
              onClick={() => onNavigate(c.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 16,
                padding: '16px 18px', borderRadius: 16, cursor: 'pointer',
                background: c.accent, border: `1px solid ${c.border}`,
                transition: 'all 0.2s', textAlign: 'left',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-1px)'; (e.currentTarget as HTMLButtonElement).style.boxShadow = `0 8px 32px ${c.accent}` }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.transform = ''; (e.currentTarget as HTMLButtonElement).style.boxShadow = '' }}
            >
              <div style={{
                width: 44, height: 44, borderRadius: 12, flexShrink: 0,
                background: 'rgba(255,255,255,0.06)', border: `1px solid ${c.border}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: c.dot,
              }}>
                {c.icon}
              </div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#fff', marginBottom: 3 }}>{c.title}</div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', lineHeight: 1.5 }}>{c.desc}</div>
              </div>
              <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"
                style={{ marginLeft: 'auto', color: 'rgba(255,255,255,0.2)', flexShrink: 0 }}>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

/* ── Settings panel ───────────────────────────────────────────────────────── */
function SettingsPanel() {
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('xo-fireworks-api-key') ?? '')
  const [saved, setSaved] = useState(false)
  const [show, setShow] = useState(false)

  function handleSave() {
    const trimmed = apiKey.trim()
    if (trimmed) localStorage.setItem('xo-fireworks-api-key', trimmed)
    else localStorage.removeItem('xo-fireworks-api-key')
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="web-panel-main" style={{ padding: '28px 32px', overflowY: 'auto' }}>
      <div style={{ maxWidth: 520 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.02em', marginBottom: 6 }}>Settings</h2>
        <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.3)', marginBottom: 32 }}>Configure your XO Screens workspace.</p>

        {/* API key section */}
        <div style={{ marginBottom: 28 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 12 }}>
            Fireworks AI
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ position: 'relative' }}>
              <input
                type={show ? 'text' : 'password'}
                value={apiKey}
                onChange={e => { setApiKey(e.target.value); setSaved(false) }}
                onKeyDown={e => e.key === 'Enter' && handleSave()}
                placeholder="fw_••••••••••••••••••••"
                spellCheck={false}
                style={{
                  width: '100%', boxSizing: 'border-box',
                  background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 10, padding: '10px 38px 10px 14px',
                  color: '#fff', fontSize: 12, fontFamily: 'monospace', outline: 'none',
                }}
                onFocus={e => { e.currentTarget.style.borderColor = 'rgba(139,92,246,0.5)' }}
                onBlur={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)' }}
              />
              <button onClick={() => setShow(v => !v)} style={{
                position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                background: 'none', border: 'none', cursor: 'pointer',
                color: 'rgba(255,255,255,0.3)', padding: 2,
              }}>
                <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  {show
                    ? <><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></>
                    : <><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></>}
                </svg>
              </button>
            </div>
            <button onClick={handleSave} style={{
              padding: '10px', borderRadius: 10, border: 'none', cursor: 'pointer',
              background: saved ? 'rgba(16,185,129,0.2)' : 'rgba(139,92,246,0.6)',
              color: saved ? 'rgba(16,185,129,0.9)' : '#fff',
              fontSize: 12, fontWeight: 600, fontFamily: 'inherit', transition: 'all 0.2s',
            }}>
              {saved ? '✓ Saved' : 'Save API Key'}
            </button>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)', lineHeight: 1.6 }}>
              Get your key at{' '}
              <a href="https://fireworks.ai" target="_blank" rel="noreferrer"
                style={{ color: 'rgba(139,92,246,0.7)', textDecoration: 'none' }}>fireworks.ai</a>
              . Stored locally in your browser only.
            </div>
          </div>
        </div>

        {/* About section */}
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 12 }}>
            About
          </div>
          <div style={{
            padding: '14px 16px', borderRadius: 12,
            background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
            display: 'flex', flexDirection: 'column', gap: 10,
          }}>
            {[
              { label: 'Version', value: '0.0.0' },
              { label: 'Mode', value: 'Web App' },
              { label: 'Provider', value: 'Fireworks AI' },
              { label: 'Chat',    value: 'DeepSeek V4 Pro' },
              { label: 'Captions', value: 'Kimi K2 P6 (Vision)' },
            ].map(row => (
              <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)' }}>{row.label}</span>
                <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.65)', fontFamily: 'monospace' }}>{row.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

/* ── Web-native chat panel ────────────────────────────────────────────────── */
import type { Message, ChatSession } from './types'
import {
  initSessions, newSession, upsertSession, saveSessions, deriveTitleFromMessage, deleteSession,
} from './chatHistory'

// Capability groups — mirrors overlay ChatBox exactly
const WEB_CAP_GROUPS = [
  {
    id: 'notes_read', label: 'Read Notes',
    description: 'List all notes and read their contents.',
    color: 'rgba(52,211,153,0.9)',
    tools: ['list_notes', 'get_note'],
    icon: <svg width="13" height="13" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>,
  },
  {
    id: 'notes_write', label: 'Write Notes',
    description: 'Create, edit, delete, and focus notes.',
    color: 'rgba(167,139,250,0.9)',
    tools: ['create_note', 'update_note', 'delete_note', 'focus_note'],
    icon: <svg width="13" height="13" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>,
  },
  {
    id: 'caption_history', label: 'Caption History',
    description: 'Read the video captions history.',
    color: 'rgba(245,158,11,0.9)',
    tools: ['get_caption_history'],
    icon: <svg width="13" height="13" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.723v6.554a1 1 0 01-1.447.894L15 14M4 8a2 2 0 012-2h9a2 2 0 012 2v8a2 2 0 01-2 2H6a2 2 0 01-2-2V8z" /></svg>,
  },
] as const

type CapId = typeof WEB_CAP_GROUPS[number]['id']
type EnabledCaps = Record<CapId, boolean>
const CAPS_KEY = 'xo-web-chat-capabilities'
function loadCaps(): EnabledCaps {
  try { return { ...defaultCaps(), ...JSON.parse(localStorage.getItem(CAPS_KEY) ?? '{}') } }
  catch { return defaultCaps() }
}
function defaultCaps(): EnabledCaps {
  return Object.fromEntries(WEB_CAP_GROUPS.map(g => [g.id, true])) as EnabledCaps
}
function saveCaps(c: EnabledCaps) { localStorage.setItem(CAPS_KEY, JSON.stringify(c)) }

function timeAgoChat(ts: number) {
  const d = Date.now() - ts
  if (d < 60_000) return 'just now'
  if (d < 3_600_000) return `${Math.floor(d / 60_000)}m ago`
  if (d < 86_400_000) return `${Math.floor(d / 3_600_000)}h ago`
  return `${Math.floor(d / 86_400_000)}d ago`
}

function CapToggle({ on, onChange, color }: { on: boolean; onChange: (v: boolean) => void; color: string }) {
  return (
    <button onClick={() => onChange(!on)} style={{
      width: 32, height: 18, borderRadius: 99, border: 'none', cursor: 'pointer',
      background: on ? color.replace('0.9', '0.7') : 'rgba(255,255,255,0.1)',
      position: 'relative', flexShrink: 0, transition: 'background 0.2s',
      boxShadow: on ? `0 0 8px ${color.replace('0.9', '0.35')}` : 'none',
    }}>
      <span style={{
        position: 'absolute', top: 2, left: on ? 16 : 2,
        width: 14, height: 14, borderRadius: '50%',
        background: on ? '#fff' : 'rgba(255,255,255,0.4)',
        transition: 'left 0.2s, background 0.2s', display: 'block',
      }} />
    </button>
  )
}

interface WebChatPanelProps {
  activeNote?: Note | null
  appControl?: AppControl
}

function WebChatPanel({ activeNote, appControl }: WebChatPanelProps) {
  const [sessions, setSessions] = useState<ChatSession[]>(() => initSessions().sessions)
  const [activeId, setActiveId] = useState<string>(() => initSessions().active.id)
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [activeTools, setActiveTools] = useState<string[]>([])
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [enabledCaps, setEnabledCaps] = useState<EnabledCaps>(loadCaps)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLDivElement>(null)
  const executorRef = useRef<((c: ToolCallRequest) => Promise<unknown>) | null>(null)

  const activeSession = sessions.find(s => s.id === activeId) ?? sessions[0]
  const messages: Message[] = activeSession?.messages ?? []

  const enabledToolNames: Set<string> = new Set(
    WEB_CAP_GROUPS.filter(g => enabledCaps[g.id]).flatMap(g => [...g.tools])
  )
  const activeAppTools = APP_TOOLS.filter(t => enabledToolNames.has(t.name))

  useEffect(() => { if (appControl) executorRef.current = makeExecutor(appControl) }, [appControl])
  useEffect(() => { saveSessions(sessions) }, [sessions])
  useEffect(() => { saveCaps(enabledCaps) }, [enabledCaps])
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, loading, activeTools])

  function handleNewChat() {
    const s = newSession()
    setSessions(prev => [s, ...prev])
    setActiveId(s.id)
    setSettingsOpen(false)
    setConfirmDeleteId(null)
    setInput('')
  }

  function handleDeleteSession(id: string) {
    const next = deleteSession(sessions, id)
    const fallback = next.length > 0 ? next : [newSession()]
    setSessions(fallback)
    if (activeId === id) setActiveId(fallback[0].id)
    setConfirmDeleteId(null)
  }

  const handleSend = useCallback(async (overrideText?: string) => {
    const text = (overrideText ?? input).trim()
    if (!text || loading) return

    const userMsg: Message = { id: Date.now().toString(), role: 'user', content: text, timestamp: new Date() }
    const isFirstUserMsg = messages.filter(m => m.role === 'user').length === 0
    const newTitle = isFirstUserMsg ? deriveTitleFromMessage(text) : activeSession.title
    const updatedMessages = [...messages, userMsg]

    setSessions(prev => upsertSession(prev, { ...activeSession, title: newTitle, messages: updatedMessages, updatedAt: Date.now() }))
    setInput('')
    setLoading(true)
    setActiveTools([])

    try {
      const noteCtx = activeNote
        ? `The user has a note open titled "${activeNote.title || 'Untitled'}" with content:\n"""\n${activeNote.content || '(empty)'}\n"""\nYou can reference it or edit it using the update_note tool (if write access is enabled).`
        : ''
      const capLines = WEB_CAP_GROUPS.filter(g => enabledCaps[g.id]).map(g => `- ${g.label}: ${g.description}`).join('\n')
      const toolsCtx = appControl && activeAppTools.length > 0
        ? `You have access to XO web app capabilities:\n${capLines}\nUse tools proactively when the user asks you to do something in the app. After taking actions, summarise what you did briefly.`
        : appControl ? 'All app-control capabilities are currently disabled by the user.' : ''
      const systemPrompt = ['You are XO, an intelligent AI assistant running as a web app. Be concise, helpful, and friendly.', toolsCtx, noteCtx].filter(Boolean).join('\n\n')

      let reply: string
      if (appControl && executorRef.current && activeAppTools.length > 0) {
        reply = await sendToGeminiWithTools(
          updatedMessages, text, systemPrompt, activeAppTools,
          executorRef.current,
          (call) => setActiveTools(prev => [...prev, call.name]),
        )
      } else {
        reply = await sendToGeminiWithSystem(updatedMessages, text, systemPrompt)
      }

      setActiveTools([])
      setSessions(prev => upsertSession(prev, {
        ...activeSession, title: newTitle,
        messages: [...updatedMessages, { id: Date.now().toString(), role: 'assistant', content: reply, timestamp: new Date() }],
        updatedAt: Date.now(),
      }))
    } catch (err) {
      setActiveTools([])
      setSessions(prev => upsertSession(prev, {
        ...activeSession, title: newTitle,
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

  return (
    <>
      <div className="web-panel-main" style={{ flexDirection: 'row', padding: 0 }}>

        {/* ── History sidebar ── */}
        <div style={{
          width: 220, flexShrink: 0,
          borderRight: '1px solid rgba(255,255,255,0.06)',
          background: 'rgba(0,0,0,0.2)',
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
        }}>
          {/* Sidebar header */}
          <div style={{
            padding: '18px 14px 12px',
            borderBottom: '1px solid rgba(255,255,255,0.05)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>Chats</span>
              <span style={{
                fontSize: 10, fontWeight: 600, color: 'rgba(255,255,255,0.3)',
                background: 'rgba(255,255,255,0.07)', borderRadius: 6, padding: '1px 6px',
              }}>{sessions.length}</span>
            </div>
            {/* New chat button */}
            <button
              onClick={handleNewChat}
              title="New chat"
              style={{
                width: 28, height: 28, borderRadius: 8,
                border: '1px solid rgba(255,255,255,0.1)',
                background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.5)',
                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'all 0.15s',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.12)'; (e.currentTarget as HTMLButtonElement).style.color = '#fff' }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.05)'; (e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.5)' }}
            >
              <svg width="12" height="12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
              </svg>
            </button>
          </div>

          {/* Session list */}
          <div className="web-scroll" style={{ flex: 1, overflowY: 'auto', padding: '8px', display: 'flex', flexDirection: 'column', gap: 2 }}>
            {sessions.map(s => (
              <div key={s.id} style={{ position: 'relative' }}>
                {confirmDeleteId === s.id ? (
                  <div style={{ padding: '8px 10px', borderRadius: 10, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Delete?</span>
                    <button onClick={() => handleDeleteSession(s.id)} style={{ fontSize: 10, fontWeight: 600, color: '#f87171', background: 'rgba(239,68,68,0.18)', border: '1px solid rgba(239,68,68,0.35)', borderRadius: 6, padding: '2px 8px', cursor: 'pointer' }}>Yes</button>
                    <button onClick={() => setConfirmDeleteId(null)} style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, padding: '2px 8px', cursor: 'pointer' }}>No</button>
                  </div>
                ) : (
                  <div
                    className="chat-history-row"
                    onClick={() => { setActiveId(s.id); setInput('') }}
                    style={{ padding: '9px 11px', borderRadius: 10, background: s.id === activeId ? 'rgba(255,255,255,0.08)' : 'transparent', border: s.id === activeId ? '1px solid rgba(255,255,255,0.12)' : '1px solid transparent', cursor: 'pointer', transition: 'all 0.15s', display: 'flex', alignItems: 'center', gap: 6 }}
                    onMouseEnter={e => { if (s.id !== activeId) (e.currentTarget as HTMLDivElement).style.background = 'rgba(255,255,255,0.04)' }}
                    onMouseLeave={e => { if (s.id !== activeId) (e.currentTarget as HTMLDivElement).style.background = 'transparent' }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: s.id === activeId ? 600 : 400, color: s.id === activeId ? '#fff' : 'rgba(255,255,255,0.55)', marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.title}</div>
                      <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)' }}>{s.messages.filter(m => m.role === 'user').length} msg · {timeAgoChat(s.updatedAt)}</div>
                    </div>
                    <button onClick={e => { e.stopPropagation(); setConfirmDeleteId(s.id) }}
                      className="chat-history-delete"
                      style={{ width: 22, height: 22, borderRadius: 6, border: 'none', background: 'transparent', color: 'rgba(255,255,255,0.18)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'all 0.15s', opacity: 0 }}
                      onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = '#f87171'; (e.currentTarget as HTMLButtonElement).style.background = 'rgba(239,68,68,0.12)'; (e.currentTarget as HTMLButtonElement).style.opacity = '1' }}
                      onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.18)'; (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
                    >
                      <svg width="10" height="10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* ── Chat area ── */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          {/* Header */}
          <div className="web-panel-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{
                color: '#fff', fontWeight: 900, fontSize: 15, letterSpacing: '-0.03em',
                textShadow: '0 0 12px rgba(255,255,255,0.8), 0 0 24px rgba(255,255,255,0.4)',
              }}>XO</span>
              <span className="web-panel-subtitle" style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {activeSession?.title ?? 'Assistant'}
              </span>
            </div>
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
              {activeNote && (
                <div title={`Note context: "${activeNote.title || 'Untitled'}"`} style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  padding: '3px 9px', borderRadius: 8,
                  background: 'rgba(139,92,246,0.12)', border: '1px solid rgba(139,92,246,0.25)',
                  maxWidth: 160, overflow: 'hidden',
                }}>
                  <svg width="9" height="9" fill="none" stroke="rgba(139,92,246,0.9)" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                  <span style={{ fontSize: 10, color: 'rgba(139,92,246,0.9)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {activeNote.title || 'Untitled'}
                  </span>
                </div>
              )}
              <div className="status-dot" />
              <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>DeepSeek V4 Pro</span>
              {/* Capabilities gear */}
              <button onClick={() => setSettingsOpen(v => !v)} title="Chat capabilities"
                style={{ width: 26, height: 26, borderRadius: 8, border: 'none', background: settingsOpen ? 'rgba(255,255,255,0.1)' : 'transparent', color: settingsOpen ? '#fff' : 'rgba(255,255,255,0.3)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s' }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.1)'; (e.currentTarget as HTMLButtonElement).style.color = '#fff' }}
                onMouseLeave={e => { if (!settingsOpen) { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; (e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.3)' } }}
              >
                <svg width="13" height="13" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <circle cx="12" cy="12" r="3" strokeWidth={2} />
                  <path strokeWidth={2} strokeLinecap="round" d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
                </svg>
              </button>
            </div>
          </div>

          {/* Capabilities drawer */}
          {settingsOpen && (
            <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)', background: 'rgba(0,0,0,0.3)', display: 'flex', flexDirection: 'column', gap: 6 }}>
              <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', margin: '0 0 4px', lineHeight: 1.5 }}>Control what XO can do. Disabled tools are never sent to the AI.</p>
              {WEB_CAP_GROUPS.map(group => {
                const isOn = !!enabledCaps[group.id]
                return (
                  <div key={group.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 10, background: isOn ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.02)', border: `1px solid ${isOn ? group.color.replace('0.9', '0.18') : 'rgba(255,255,255,0.06)'}`, transition: 'all 0.2s' }}>
                    <div style={{ width: 28, height: 28, borderRadius: 8, flexShrink: 0, background: isOn ? group.color.replace('0.9', '0.12') : 'rgba(255,255,255,0.05)', border: `1px solid ${isOn ? group.color.replace('0.9', '0.25') : 'rgba(255,255,255,0.08)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: isOn ? group.color : 'rgba(255,255,255,0.25)', transition: 'all 0.2s' }}>
                      {group.icon}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: isOn ? '#fff' : 'rgba(255,255,255,0.4)', marginBottom: 1 }}>{group.label}</div>
                      <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.28)', lineHeight: 1.4 }}>{group.description}</div>
                    </div>
                    <CapToggle on={isOn} onChange={v => setEnabledCaps(prev => ({ ...prev, [group.id]: v }))} color={group.color} />
                  </div>
                )
              })}
            </div>
          )}

          {/* Messages */}
          <div className="web-scroll" style={{ flex: 1, padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            {messages.map(msg => (
              <div key={msg.id} className="fade-in" style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
                {msg.role === 'assistant' && (
                  <div style={{ marginRight: 10, marginTop: 2, flexShrink: 0 }}>
                    <div style={{
                      width: 26, height: 26, borderRadius: 8,
                      background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <span style={{ fontSize: 9, fontWeight: 900, color: '#fff', letterSpacing: '-0.02em' }}>XO</span>
                    </div>
                  </div>
                )}
                <div className={msg.role === 'user' ? 'web-msg-user' : 'web-msg-ai'}>
                  {msg.content}
                </div>
              </div>
            ))}
            {loading && (
              <div className="fade-in" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{
                  width: 26, height: 26, borderRadius: 8,
                  background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}>
                  <span style={{ fontSize: 9, fontWeight: 900, color: '#fff' }}>XO</span>
                </div>
                <div style={{ display: 'flex', gap: 5, alignItems: 'center', paddingLeft: 2 }}>
                  {[0, 150, 300].map(delay => (
                    <span key={delay} style={{
                      width: 5, height: 5, borderRadius: '50%',
                      background: 'rgba(255,255,255,0.3)', display: 'inline-block',
                      animation: `fadeIn 0.8s ${delay}ms ease-in-out infinite alternate`,
                    }} />
                  ))}
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div style={{ padding: '16px 24px 20px', borderTop: '1px solid rgba(255,255,255,0.06)', flexShrink: 0 }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.09)',
              borderRadius: 16, padding: '0 10px 0 16px', minHeight: 48,
            }}>
              <div
                ref={inputRef}
                contentEditable
                suppressContentEditableWarning
                className="web-chat-input"
                data-placeholder="Ask anything… (Enter to send)"
                onInput={e => setInput((e.currentTarget as HTMLDivElement).innerText)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    const el = e.currentTarget as HTMLDivElement
                    const text = el.innerText.trim()
                    if (!text || loading) return
                    el.innerText = ''
                    setInput('')
                    handleSend(text)
                  }
                }}
                style={{
                  flex: 1, outline: 'none', color: '#fff',
                  fontSize: 13, lineHeight: '22px',
                  overflowY: 'auto', wordBreak: 'break-word',
                  maxHeight: 120, padding: '13px 0',
                  fontFamily: 'inherit', cursor: 'text',
                  whiteSpace: 'pre-wrap',
                }}
              />
              <div style={{ display: 'flex', gap: 6, flexShrink: 0, alignSelf: 'flex-end', paddingBottom: 7 }}>
                {/* Send button */}
                <button
                  onClick={() => {
                    const el = inputRef.current
                    const text = el?.innerText?.trim() ?? input.trim()
                    if (!text || loading) return
                    if (el) el.innerText = ''
                    setInput('')
                    handleSend(text)
                  }}
                  disabled={!input.trim() || loading}
                  style={{
                    width: 32, height: 32, borderRadius: 10,
                    background: input.trim() && !loading ? '#fff' : 'rgba(255,255,255,0.07)',
                    border: 'none', cursor: input.trim() && !loading ? 'pointer' : 'default',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: input.trim() && !loading ? 'rgba(0,0,0,0.7)' : 'rgba(255,255,255,0.25)',
                    transition: 'all 0.15s', flexShrink: 0,
                  }}
                >
                  <svg width="14" height="14" fill="currentColor" viewBox="0 0 24 24" style={{ transform: 'rotate(-45deg)' }}>
                    <path d="M2 21l21-9L2 3v7l15 2-15 2z"/>
                  </svg>
                </button>
              </div>
            </div>
            <div style={{ marginTop: 6, fontSize: 10, color: 'rgba(255,255,255,0.2)', paddingLeft: 4 }}>
              Shift+Enter for newline
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

/* ── Web-native notes wrapper ─────────────────────────────────────────────── */
function WebNotesPanel({ onNoteChange }: { onNoteChange?: (note: Note | null) => void }) {
  return (
    <div className="web-panel-main" style={{ position: 'relative' }}>
      <div style={{
        position: 'absolute', inset: 0,
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        <WebNotesInner onNoteChange={onNoteChange} />
      </div>
    </div>
  )
}

// Inline notes re-implementation styled for the web layout
import { useState as useStateN, useRef as useRefN, useEffect as useEffectN, useCallback as useCallbackN } from 'react'

const STORAGE_KEY = 'xo-notes'
const NOTE_COLORS = [
  { bg: 'rgba(255,255,255,0.0)',  dot: 'rgba(255,255,255,0.3)' },
  { bg: 'rgba(139,92,246,0.14)',  dot: 'rgba(139,92,246,0.9)' },
  { bg: 'rgba(59,130,246,0.14)',  dot: 'rgba(59,130,246,0.9)'  },
  { bg: 'rgba(16,185,129,0.14)',  dot: 'rgba(16,185,129,0.9)'  },
  { bg: 'rgba(245,158,11,0.14)',  dot: 'rgba(245,158,11,0.9)'  },
  { bg: 'rgba(239,68,68,0.14)',   dot: 'rgba(239,68,68,0.9)'   },
]

function colorFromBg(bg: string) {
  return NOTE_COLORS.find(c => c.bg === bg) ?? NOTE_COLORS[0]
}
function loadNotes(): Note[] {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') } catch { return [] }
}
function saveNotesLocal(notes: Note[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(notes))
}
function newNoteObj(): Note {
  return { id: Date.now().toString(), title: '', content: '', color: NOTE_COLORS[0].bg, createdAt: Date.now(), updatedAt: Date.now() }
}
function timeAgo(ts: number) {
  const d = Date.now() - ts
  if (d < 60_000) return 'just now'
  if (d < 3_600_000) return `${Math.floor(d / 60_000)}m ago`
  if (d < 86_400_000) return `${Math.floor(d / 3_600_000)}h ago`
  return `${Math.floor(d / 86_400_000)}d ago`
}

function WebNotesInner({ onNoteChange }: { onNoteChange?: (note: Note | null) => void }) {
  const [notes, setNotes] = useStateN<Note[]>(() => { const l = loadNotes(); return l.length ? l : [newNoteObj()] })
  const [activeId, setActiveId] = useStateN<string>(() => { const l = loadNotes(); return l.length ? l[0].id : '' })
  const [confirmDeleteId, setConfirmDeleteId] = useStateN<string | null>(null)
  const titleRef = useRefN<HTMLInputElement>(null)

  useEffectN(() => { saveNotesLocal(notes) }, [notes])

  // Refresh when another panel (e.g. Video Captions) writes new notes to localStorage
  useEffectN(() => {
    function handleNotesUpdated() {
      const fresh = loadNotes()
      setNotes(fresh.length ? fresh : [newNoteObj()])
      setActiveId(prev => fresh.some(n => n.id === prev) ? prev : (fresh[0]?.id ?? ''))
    }
    window.addEventListener('xo-notes-updated', handleNotesUpdated)
    return () => window.removeEventListener('xo-notes-updated', handleNotesUpdated)
  }, [])

  // Focus a specific note when AI calls focus_note tool
  useEffectN(() => {
    function handleFocusNote(e: Event) {
      const id = (e as CustomEvent<{ id: string }>).detail?.id
      if (id) setActiveId(id)
    }
    window.addEventListener('xo-focus-note', handleFocusNote)
    return () => window.removeEventListener('xo-focus-note', handleFocusNote)
  }, [])

  const activeNote = notes.find(n => n.id === activeId) ?? notes[0]
  const activeColor = activeNote ? colorFromBg(activeNote.color) : NOTE_COLORS[0]
  const wordCount = activeNote ? activeNote.content.trim().split(/\s+/).filter(Boolean).length : 0

  // Keep parent informed of the active note (for chat context)
  useEffectN(() => {
    onNoteChange?.(activeNote ?? null)
  }, [activeNote, onNoteChange])

  const updateNote = useCallbackN((id: string, patch: Partial<Note>) => {
    setNotes(prev => prev.map(n => n.id === id ? { ...n, ...patch, updatedAt: Date.now() } : n))
  }, [])

  function addNote() {
    const n = newNoteObj()
    setNotes(prev => [n, ...prev])
    setActiveId(n.id)
    setConfirmDeleteId(null)
    setTimeout(() => titleRef.current?.focus(), 50)
  }

  function deleteNote(id: string) {
    setNotes(prev => {
      const next = prev.filter(n => n.id !== id)
      if (!next.length) { const f = newNoteObj(); setActiveId(f.id); return [f] }
      if (activeId === id) setActiveId(next[0].id)
      return next
    })
    setConfirmDeleteId(null)
  }

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
      {/* Sidebar list */}
      <div className="web-scroll" style={{
        width: 220, flexShrink: 0,
        borderRight: '1px solid rgba(255,255,255,0.05)',
        background: 'rgba(0,0,0,0.2)',
        display: 'flex', flexDirection: 'column',
      }}>
        {/* Header */}
        <div style={{
          padding: '18px 16px 12px', borderBottom: '1px solid rgba(255,255,255,0.05)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>Notes</span>
            <span style={{
              fontSize: 10, fontWeight: 600, color: 'rgba(255,255,255,0.3)',
              background: 'rgba(255,255,255,0.07)', borderRadius: 6, padding: '1px 6px',
            }}>{notes.length}</span>
          </div>
          <button
            onClick={addNote}
            style={{
              width: 28, height: 28, borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)',
              background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.5)', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.1)'; (e.currentTarget as HTMLButtonElement).style.color = '#fff' }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.05)'; (e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.5)' }}
            title="New note"
          >
            <svg width="12" height="12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </button>
        </div>

        {/* Note list */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px', display: 'flex', flexDirection: 'column', gap: 3 }}>
          {notes.map(n => {
            const nc = colorFromBg(n.color)
            const isActive = n.id === activeId
            return (
              <button key={n.id}
                onClick={() => { setActiveId(n.id); setConfirmDeleteId(null) }}
                className={`web-notes-list-item${isActive ? ' active' : ''}`}
                style={{ border: isActive ? `1px solid ${nc.dot.replace('0.9','0.25')}` : '1px solid transparent', background: isActive ? nc.bg || 'rgba(255,255,255,0.05)' : 'transparent' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                  <span style={{ width: 5, height: 5, borderRadius: '50%', background: nc.dot, flexShrink: 0 }} />
                  <span style={{ fontSize: 12, fontWeight: isActive ? 600 : 400, color: isActive ? '#fff' : 'rgba(255,255,255,0.55)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {n.title || 'Untitled'}
                  </span>
                </div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingLeft: 11 }}>
                  {n.content ? n.content.slice(0, 32) : 'Empty'}
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* Editor */}
      {activeNote && (
        <div style={{
          flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden',
          background: activeColor.bg, transition: 'background 0.3s',
        }}>
          {/* Editor toolbar */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '14px 20px',
            borderBottom: '1px solid rgba(255,255,255,0.06)', flexShrink: 0,
          }}>
            {/* Color swatches */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              {NOTE_COLORS.map(c => (
                <button key={c.bg} onClick={() => updateNote(activeNote.id, { color: c.bg })}
                  style={{
                    width: 10, height: 10, borderRadius: '50%', padding: 0, cursor: 'pointer',
                    border: activeNote.color === c.bg ? `2px solid ${c.dot}` : '2px solid transparent',
                    background: c.dot, transform: activeNote.color === c.bg ? 'scale(1.3)' : 'scale(1)',
                    transition: 'transform 0.15s, border 0.15s',
                  }}
                />
              ))}
            </div>
            <div style={{ flex: 1 }} />
            {/* Delete */}
            {confirmDeleteId === activeNote.id ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>Delete?</span>
                <button onClick={() => deleteNote(activeNote.id)}
                  style={{ fontSize: 11, fontWeight: 600, color: '#f87171', background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 6, padding: '3px 10px', cursor: 'pointer' }}>Yes</button>
                <button onClick={() => setConfirmDeleteId(null)}
                  style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, padding: '3px 10px', cursor: 'pointer' }}>No</button>
              </div>
            ) : (
              <button onClick={() => setConfirmDeleteId(activeNote.id)}
                style={{ width: 28, height: 28, borderRadius: 8, border: 'none', background: 'transparent', color: 'rgba(255,255,255,0.25)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s' }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = '#f87171'; (e.currentTarget as HTMLButtonElement).style.background = 'rgba(239,68,68,0.1)' }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.25)'; (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
              >
                <svg width="13" height="13" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            )}
          </div>

          {/* Title */}
          <input ref={titleRef} value={activeNote.title}
            onChange={e => updateNote(activeNote.id, { title: e.target.value })}
            placeholder="Title"
            style={{
              flexShrink: 0, background: 'transparent', border: 'none', outline: 'none',
              color: '#fff', fontSize: 17, fontWeight: 700, letterSpacing: '-0.02em',
              padding: '18px 20px 8px', fontFamily: 'inherit', width: '100%',
            }}
          />
          <div style={{ height: 1, margin: '0 20px', background: 'rgba(255,255,255,0.05)', flexShrink: 0 }} />

          {/* Body */}
          <textarea value={activeNote.content}
            onChange={e => updateNote(activeNote.id, { content: e.target.value })}
            placeholder="Start writing…"
            className="web-scroll"
            style={{
              flex: 1, background: 'transparent', border: 'none', outline: 'none', resize: 'none',
              color: 'rgba(255,255,255,0.7)', fontSize: 13, lineHeight: 1.8,
              padding: '12px 20px 8px', fontFamily: 'inherit',
            }}
          />

          {/* Footer */}
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 20px 14px', flexShrink: 0 }}>
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.2)' }}>{wordCount} {wordCount === 1 ? 'word' : 'words'}</span>
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.2)' }}>{timeAgo(activeNote.updatedAt)}</span>
          </div>
        </div>
      )}
    </div>
  )
}

/* ── Web Video Captions panel ─────────────────────────────────────────────── */
import { processVideoFile, processVideoURL } from './gemini'
import type { CaptionTone, CaptionResults } from './gemini'
import type { CaptionHistoryEntry } from './types'
import { loadCaptionHistory, addCaptionHistoryEntry, deleteCaptionHistoryEntry, clearCaptionHistory } from './captionHistory'

// Tone definitions — SVG icons matching the overlay exactly
const VIDEO_TONES: { id: CaptionTone; label: string; icon: React.ReactElement; accent: string; border: string; dot: string }[] = [
  {
    id: 'formal', label: 'Formal', dot: 'rgba(59,130,246,0.9)', accent: 'rgba(59,130,246,0.12)', border: 'rgba(59,130,246,0.25)',
    icon: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="14" rx="2" /><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" /><line x1="12" y1="12" x2="12" y2="16" /><line x1="10" y1="14" x2="14" y2="14" /></svg>,
  },
  {
    id: 'sarcastic', label: 'Sarcastic', dot: 'rgba(239,68,68,0.9)', accent: 'rgba(239,68,68,0.12)', border: 'rgba(239,68,68,0.25)',
    icon: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M8 15s1.5 2 4 2 4-2 4-2" /><circle cx="9" cy="10" r="1" fill="currentColor" /><circle cx="15" cy="10" r="1" fill="currentColor" /><path d="M8 8.5c.5-1 1.5-1.5 2.5-1" strokeWidth={1.5} /><path d="M16 8.5c-.5-1-1.5-1.5-2.5-1" strokeWidth={1.5} /></svg>,
  },
  {
    id: 'humorous-tech', label: 'Humorous Tech', dot: 'rgba(139,92,246,0.9)', accent: 'rgba(139,92,246,0.12)', border: 'rgba(139,92,246,0.25)',
    icon: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><polyline points="16 18 22 12 16 6" /><polyline points="8 6 2 12 8 18" /><line x1="12" y1="4" x2="12" y2="20" opacity={0.4} strokeWidth={1.5} /></svg>,
  },
  {
    id: 'humorous-nontech', label: 'Humorous Non-Tech', dot: 'rgba(245,158,11,0.9)', accent: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.25)',
    icon: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M8 13s1.5 3 4 3 4-3 4-3" /><line x1="9" y1="9" x2="9.01" y2="9" strokeWidth={3} strokeLinecap="round" /><line x1="15" y1="9" x2="15.01" y2="9" strokeWidth={3} strokeLinecap="round" /></svg>,
  },
]

const TONE_NOTE_COLORS: Record<CaptionTone, string> = {
  formal:              'rgba(59,130,246,0.14)',
  sarcastic:           'rgba(239,68,68,0.14)',
  'humorous-tech':     'rgba(139,92,246,0.14)',
  'humorous-nontech':  'rgba(245,158,11,0.14)',
}

function VSpinner() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
      style={{ animation: 'vs-spin 0.8s linear infinite', flexShrink: 0, display: 'inline-block' }}>
      <path strokeLinecap="round" d="M12 2a10 10 0 0 1 10 10" opacity={0.9} />
      <path strokeLinecap="round" d="M12 2a10 10 0 0 0-10 10" opacity={0.3} />
    </svg>
  )
}

function WebVideoPanel() {
  const [inputMode, setInputMode] = useState<'file' | 'url'>('file')
  const [videoFile, setVideoFile] = useState<File | null>(null)
  const [videoURL, setVideoURL] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const [status, setStatus] = useState<'idle' | 'processing' | 'done' | 'error'>('idle')
  const [processingTone, setProcessingTone] = useState<CaptionTone | null>(null)
  const [uploadPhase, setUploadPhase] = useState<'uploading' | 'processing' | null>(null)
  const [uploadPct, setUploadPct] = useState<number>(0)
  const [errorMsg, setErrorMsg] = useState('')
  const [results, setResults] = useState<CaptionResults | null>(null)
  const [activeTone, setActiveTone] = useState<CaptionTone>('formal')
  const [activeTab, setActiveTab] = useState<'summary' | 'captions'>('summary')
  const [savedToNotes, setSavedToNotes] = useState(false)
  const [currentLabel, setCurrentLabel] = useState('')
  const [history, setHistory] = useState<CaptionHistoryEntry[]>(() => loadCaptionHistory())
  const [showHistory, setShowHistory] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  function handleFile(file: File) {
    if (!file.type.startsWith('video/')) { setErrorMsg('Please upload a video file.'); setStatus('error'); return }
    setVideoFile(file); setStatus('idle'); setErrorMsg(''); setResults(null); setSavedToNotes(false)
  }

  async function handleProcess() {
    setStatus('processing'); setResults(null); setErrorMsg(''); setSavedToNotes(false)
    setUploadPhase(null); setUploadPct(0)
    try {
      let res: CaptionResults
      let label: string
      if (inputMode === 'file' && videoFile) {
        res = await processVideoFile(
          videoFile,
          t => setProcessingTone(t),
          (phase, pct) => { setUploadPhase(phase); if (pct !== undefined) setUploadPct(pct) },
        )
        label = videoFile.name
      } else if (inputMode === 'url' && videoURL.trim()) {
        res = await processVideoURL(videoURL.trim(), t => setProcessingTone(t))
        label = videoURL.trim()
      } else { throw new Error('No video source provided.') }
      setResults(res); setStatus('done'); setProcessingTone(null)
      setUploadPhase(null); setCurrentLabel(label)
      const updated = addCaptionHistoryEntry({ label, results: res })
      setHistory(updated)
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Something went wrong.')
      setStatus('error'); setProcessingTone(null); setUploadPhase(null)
    }
  }

  function handleLoadFromHistory(entry: CaptionHistoryEntry) {
    setResults(entry.results as CaptionResults)
    setCurrentLabel(entry.label)
    setStatus('done')
    setActiveTone('formal')
    setActiveTab('summary')
    setSavedToNotes(false)
    setShowHistory(false)
  }

  function handleDeleteHistory(id: string) {
    setHistory(deleteCaptionHistoryEntry(id))
  }

  function handleClearHistory() {
    clearCaptionHistory()
    setHistory([])
  }

  function saveAllToNotes() {
    if (!results) return
    const existing: Note[] = (() => { try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') } catch { return [] } })()
    const label = currentLabel || (videoFile ? videoFile.name : videoURL.trim())
    const ts = new Date().toLocaleString()
    const newNotes: Note[] = VIDEO_TONES.map(t => {
      const r = results[t.id]
      const content =
        `[Video] ${label}\n[Generated] ${ts}\n\n` +
        `-- Summary --\n${r.summary}\n\n` +
        `-- Captions --\n${r.captions || '(No timestamped captions generated)'}`
      const now = Date.now()
      return { id: now.toString() + Math.random().toString(36).slice(2), title: `[${t.label}] ${label}`, content, color: TONE_NOTE_COLORS[t.id], createdAt: now, updatedAt: now }
    })
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...newNotes, ...existing]))
    window.dispatchEvent(new CustomEvent('xo-notes-updated'))
    setSavedToNotes(true)
  }

  const canProcess = status !== 'processing' && (inputMode === 'file' ? !!videoFile : videoURL.trim().length > 5)
  const activeToneData = VIDEO_TONES.find(t => t.id === activeTone)!
  const activeResult = results?.[activeTone]

  return (
    <div className="web-panel-main" style={{ flexDirection: 'row', padding: 0, position: 'relative' }}>
      <style>{`@keyframes vs-spin { to { transform: rotate(360deg); } }`}</style>

      {/* ── Left: input + controls ── */}
      <div style={{
        width: 380, flexShrink: 0, display: 'flex', flexDirection: 'column',
        borderRight: '1px solid rgba(255,255,255,0.06)', background: 'rgba(0,0,0,0.2)',
        overflow: 'hidden',
      }}>
        {/* Header */}
        <div className="web-panel-header" style={{ flexShrink: 0 }}>
          <span style={{ color: '#fff', fontWeight: 900, fontSize: 15, letterSpacing: '-0.03em', textShadow: '0 0 12px rgba(255,255,255,0.8)' }}>XO</span>
          <span className="web-panel-subtitle">Video Summarizer</span>
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
            {/* Input mode toggle */}
            <div style={{ display: 'flex', gap: 3, background: 'rgba(255,255,255,0.05)', borderRadius: 10, padding: 3 }}>
              {(['file', 'url'] as const).map(m => (
                <button key={m} onClick={() => { setInputMode(m); setResults(null); setStatus('idle'); setSavedToNotes(false) }}
                  style={{
                    padding: '3px 10px', borderRadius: 7, border: 'none', cursor: 'pointer',
                    fontSize: 10, fontWeight: 500, fontFamily: 'inherit',
                    background: inputMode === m ? 'rgba(255,255,255,0.1)' : 'transparent',
                    color: inputMode === m ? '#fff' : 'rgba(255,255,255,0.35)', transition: 'all 0.15s',
                  }}>
                  {m === 'file' ? 'Upload' : 'URL'}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Drop zone / URL input */}
        <div style={{ padding: '16px 18px', flexShrink: 0 }}>
          {inputMode === 'file' ? (
            <div
              onClick={() => fileInputRef.current?.click()}
              onDragOver={e => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files?.[0]; if (f) handleFile(f) }}
              style={{
                border: `1.5px dashed ${dragOver ? 'rgba(139,92,246,0.7)' : 'rgba(255,255,255,0.1)'}`,
                borderRadius: 14, padding: '20px 16px',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
                cursor: 'pointer', transition: 'all 0.15s',
                background: dragOver ? 'rgba(139,92,246,0.07)' : 'rgba(255,255,255,0.02)',
              }}
            >
              <svg width="28" height="28" fill="none" stroke="rgba(255,255,255,0.25)" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.723v6.554a1 1 0 01-1.447.894L15 14M4 8a2 2 0 012-2h9a2 2 0 012 2v8a2 2 0 01-2 2H6a2 2 0 01-2-2V8z" />
              </svg>
              {videoFile ? (
                <div style={{ textAlign: 'center' }}>
                  <div style={{ color: '#fff', fontSize: 12, fontWeight: 600 }}>{videoFile.name}</div>
                  <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 11, marginTop: 3 }}>
                    {(videoFile.size / (1024 * 1024)).toFixed(1)} MB
                    {' · '}
                    <span style={{ color: videoFile.size > 75 * 1024 * 1024 ? 'rgba(245,158,11,0.8)' : 'rgba(52,211,153,0.7)' }}>
                      {videoFile.size > 75 * 1024 * 1024 ? 'Files API upload' : 'Inline (fast)'}
                    </span>
                    {' · click to change'}
                  </div>
                </div>
              ) : (
                <>
                  <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: 12, fontWeight: 500 }}>Drop a video or click to upload</div>
                  {/* File type badges */}
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', justifyContent: 'center', marginTop: 2 }}>
                    {['MP4', 'WEBM', 'MOV', 'AVI', 'MKV'].map(ext => (
                      <span key={ext} style={{
                        fontSize: 9, fontWeight: 700, letterSpacing: '0.06em',
                        padding: '2px 6px', borderRadius: 5,
                        background: 'rgba(255,255,255,0.06)',
                        border: '1px solid rgba(255,255,255,0.1)',
                        color: 'rgba(255,255,255,0.35)',
                      }}>{ext}</span>
                    ))}
                  </div>

                </>
              )}
              <input ref={fileInputRef} type="file" accept="video/*" onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }} style={{ display: 'none' }} />
            </div>
          ) : (
            <input type="url" value={videoURL}
              onChange={e => { setVideoURL(e.target.value); setResults(null); setStatus('idle'); setSavedToNotes(false) }}
              placeholder="https://example.com/video.mp4"
              style={{
                width: '100%', boxSizing: 'border-box',
                background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 12, padding: '11px 14px', color: '#fff', fontSize: 12,
                fontFamily: 'inherit', outline: 'none',
              }}
              onFocus={e => { e.currentTarget.style.borderColor = 'rgba(139,92,246,0.5)' }}
              onBlur={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)' }}
            />
          )}
        </div>

        {/* Process button */}
        <div style={{ padding: '0 18px', flexShrink: 0, display: 'flex', gap: 8 }}>
          <button onClick={handleProcess} disabled={!canProcess} style={{
            flex: 1, padding: '10px 16px', borderRadius: 12, border: 'none',
            background: canProcess ? 'rgba(139,92,246,0.75)' : 'rgba(255,255,255,0.07)',
            color: canProcess ? '#fff' : 'rgba(255,255,255,0.3)',
            fontSize: 12, fontWeight: 600, fontFamily: 'inherit', cursor: canProcess ? 'pointer' : 'not-allowed',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
            transition: 'all 0.15s', boxShadow: canProcess ? '0 0 20px rgba(139,92,246,0.2)' : 'none',
          }}
            onMouseEnter={e => { if (canProcess) (e.currentTarget as HTMLButtonElement).style.background = 'rgba(139,92,246,0.9)' }}
            onMouseLeave={e => { if (canProcess) (e.currentTarget as HTMLButtonElement).style.background = 'rgba(139,92,246,0.75)' }}
          >
            {status === 'processing'
              ? <><VSpinner /> {processingTone ? `Processing "${VIDEO_TONES.find(t => t.id === processingTone)?.label}"…` : 'Processing…'}</>
              : <>{status === 'done' ? 'Re-summarize' : 'Generate Video Summary'}</>
            }
          </button>
        </div>

        {/* Error */}
        {status === 'error' && (
          <div style={{ margin: '12px 18px 0', padding: '10px 14px', borderRadius: 12, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.22)', color: 'rgba(239,68,68,0.85)', fontSize: 12 }}>
            ⚠ {errorMsg}
          </div>
        )}

        {/* Progress tracker */}
        {status === 'processing' && (
          <div style={{ margin: '12px 18px 0', display: 'flex', flexDirection: 'column', gap: 6 }}>

            {/* Upload progress bar — only shown for large files using Files API */}
            {uploadPhase && (
              <div style={{
                padding: '8px 12px', borderRadius: 10,
                background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)',
                display: 'flex', flexDirection: 'column', gap: 6,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <VSpinner />
                  <span style={{ fontSize: 11, color: 'rgba(245,158,11,0.9)', fontWeight: 500 }}>
                    {uploadPhase === 'uploading'
                      ? `Uploading to Files API… ${uploadPct}%`
                      : 'Fireworks AI is processing your video…'}
                  </span>
                </div>
                {uploadPhase === 'uploading' && (
                  <div style={{ height: 3, borderRadius: 99, background: 'rgba(255,255,255,0.07)', overflow: 'hidden' }}>
                    <div style={{
                      height: '100%', borderRadius: 99,
                      background: 'rgba(245,158,11,0.7)',
                      width: `${uploadPct}%`,
                      transition: 'width 0.3s ease',
                    }} />
                  </div>
                )}
              </div>
            )}

            {VIDEO_TONES.map((t, i) => {
              const curIdx = VIDEO_TONES.findIndex(x => x.id === processingTone)
              const isDone = curIdx > i
              const isCur  = t.id === processingTone
              return (
                <div key={t.id} style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '8px 12px', borderRadius: 10,
                  background: isCur ? t.accent : isDone ? 'rgba(16,185,129,0.07)' : 'rgba(255,255,255,0.03)',
                  border: `1px solid ${isCur ? t.border : isDone ? 'rgba(16,185,129,0.2)' : 'rgba(255,255,255,0.06)'}`,
                  transition: 'all 0.2s',
                }}>
                  <span style={{ display: 'flex', color: isCur ? '#fff' : isDone ? 'rgba(16,185,129,0.8)' : 'rgba(255,255,255,0.25)' }}>{t.icon}</span>
                  <span style={{ fontSize: 12, color: isCur ? '#fff' : isDone ? 'rgba(16,185,129,0.8)' : 'rgba(255,255,255,0.3)', flex: 1 }}>{t.label}</span>
                  {isCur ? <VSpinner /> : isDone ? <span style={{ color: 'rgba(16,185,129,0.8)', fontSize: 13 }}>✓</span> : <span style={{ color: 'rgba(255,255,255,0.15)', fontSize: 12 }}>○</span>}
                </div>
              )
            })}
          </div>
        )}

        {/* Save to notes button */}
        {status === 'done' && (
          <div style={{ padding: '12px 18px 0', flexShrink: 0 }}>
            {!savedToNotes ? (
              <button onClick={saveAllToNotes} style={{
                width: '100%', padding: '10px 16px', borderRadius: 12,
                border: '1px solid rgba(16,185,129,0.3)', background: 'rgba(16,185,129,0.1)',
                color: 'rgba(16,185,129,0.9)', fontSize: 12, fontWeight: 600, fontFamily: 'inherit',
                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                transition: 'all 0.15s',
              }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(16,185,129,0.18)' }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(16,185,129,0.1)' }}
              >
                <svg width="13" height="13" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
                Save all tones to Notes
              </button>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '10px', color: 'rgba(16,185,129,0.8)', fontSize: 12, fontWeight: 500 }}>
                <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
                Saved to Notes
              </div>
            )}
          </div>
        )}

        {/* ── History section (second row, VS Code-style) ── */}
        {/* Divider / section header — always visible, click to toggle */}
        <button onClick={() => setShowHistory(v => !v)} style={{
          marginTop: 'auto', flexShrink: 0,
          display: 'flex', alignItems: 'center', gap: 6,
          width: '100%', padding: '8px 14px',
          borderTop: '1px solid rgba(255,255,255,0.07)',
          background: 'rgba(255,255,255,0.02)',
          border: 'none', borderTopColor: 'rgba(255,255,255,0.07)',
          borderTopStyle: 'solid', borderTopWidth: 1,
          cursor: 'pointer', transition: 'background 0.15s',
          textAlign: 'left',
        }}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.05)' }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.02)' }}
        >
          {/* Chevron — rotates when open */}
          <svg width="10" height="10" fill="none" stroke="rgba(255,255,255,0.4)" viewBox="0 0 24 24"
            style={{ transition: 'transform 0.2s', transform: showHistory ? 'rotate(90deg)' : 'rotate(0deg)', flexShrink: 0 }}>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
          </svg>
          <span style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.45)', letterSpacing: '0.07em', textTransform: 'uppercase', flex: 1 }}>
            History
          </span>
          {history.length > 0 && (
            <span style={{
              fontSize: 10, fontWeight: 600, color: 'rgba(255,255,255,0.3)',
              background: 'rgba(255,255,255,0.07)', borderRadius: 5, padding: '1px 6px',
            }}>{history.length}</span>
          )}
        </button>

        {/* Collapsible history list */}
        <div style={{
          height: showHistory ? 260 : 0,
          flexShrink: 0,
          overflow: 'hidden',
          transition: 'height 0.25s cubic-bezier(0.4,0,0.2,1)',
          borderTop: showHistory ? '1px solid rgba(255,255,255,0.05)' : 'none',
        }}>
          <div style={{ height: 260, display: 'flex', flexDirection: 'column' }}>
            {/* Clear all row */}
            {history.length > 0 && (
              <div style={{ padding: '7px 14px 4px', flexShrink: 0, display: 'flex', justifyContent: 'flex-end' }}>
                <button onClick={handleClearHistory} style={{
                  padding: '2px 9px', borderRadius: 6, border: '1px solid rgba(239,68,68,0.22)',
                  background: 'rgba(239,68,68,0.07)', color: 'rgba(239,68,68,0.65)',
                  fontSize: 10, fontWeight: 500, fontFamily: 'inherit', cursor: 'pointer', transition: 'all 0.15s',
                }}
                  onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(239,68,68,0.16)' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(239,68,68,0.07)' }}
                >Clear all</button>
              </div>
            )}

            {/* Entry list */}
            <div className="web-scroll" style={{ flex: 1, overflowY: 'auto', padding: '4px 10px 10px', display: 'flex', flexDirection: 'column', gap: 5 }}>
              {history.length === 0 ? (
                <div style={{
                  flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
                  justifyContent: 'center', gap: 8, color: 'rgba(255,255,255,0.18)', paddingTop: 24,
                }}>
                  <svg width="22" height="22" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.3}>
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="12 6 12 12 16 14" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <span style={{ fontSize: 11 }}>No history yet</span>
                </div>
              ) : history.map(entry => {
                const date = new Date(entry.createdAt)
                const dateStr = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
                const timeStr = date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
                const toneCount = Object.keys(entry.results).length
                return (
                  <div key={entry.id} style={{
                    background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)',
                    borderRadius: 10, padding: '8px 10px',
                    display: 'flex', alignItems: 'center', gap: 8,
                    transition: 'background 0.15s',
                  }}
                    onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = 'rgba(255,255,255,0.07)' }}
                    onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = 'rgba(255,255,255,0.04)' }}
                  >
                    {/* Info */}
                    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
                      <div style={{ color: '#fff', fontSize: 11, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={entry.label}>
                        {entry.label}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <span style={{ color: 'rgba(255,255,255,0.25)', fontSize: 10 }}>{dateStr} · {timeStr}</span>
                        <span style={{ color: 'rgba(139,92,246,0.7)', fontSize: 10, fontWeight: 500, background: 'rgba(139,92,246,0.1)', borderRadius: 4, padding: '0px 4px' }}>
                          {toneCount}t
                        </span>
                        {/* Tone dots */}
                        <div style={{ display: 'flex', gap: 3 }}>
                          {VIDEO_TONES.filter(t => entry.results[t.id]).map(t => (
                            <div key={t.id} title={t.label} style={{ width: 5, height: 5, borderRadius: 99, background: t.dot, opacity: 0.75 }} />
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Actions */}
                    <button onClick={() => handleLoadFromHistory(entry)} title="Load" style={{
                      padding: '4px 9px', borderRadius: 7, border: 'none', flexShrink: 0,
                      background: 'rgba(139,92,246,0.2)', color: 'rgba(139,92,246,0.9)',
                      fontSize: 10, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer', transition: 'all 0.15s',
                    }}
                      onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(139,92,246,0.35)' }}
                      onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(139,92,246,0.2)' }}
                    >Load</button>
                    <button onClick={() => handleDeleteHistory(entry.id)} title="Delete" style={{
                      width: 24, height: 24, borderRadius: 7, border: 'none', flexShrink: 0,
                      background: 'transparent', color: 'rgba(255,255,255,0.2)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      cursor: 'pointer', transition: 'all 0.15s',
                    }}
                      onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = '#f87171'; (e.currentTarget as HTMLButtonElement).style.background = 'rgba(239,68,68,0.12)' }}
                      onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.2)'; (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
                    >
                      <svg width="11" height="11" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>

      {/* ── Right: results viewer ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
        {/* Header / tone tabs */}
        <div className="web-panel-header" style={{ gap: 6, flexWrap: 'wrap' }}>
          {status === 'done' && results ? (
            <>
              {VIDEO_TONES.map(t => (
                <button key={t.id} onClick={() => setActiveTone(t.id)} style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  padding: '5px 12px', borderRadius: 99, border: 'none', cursor: 'pointer',
                  fontSize: 11, fontWeight: activeTone === t.id ? 600 : 400, fontFamily: 'inherit',
                  background: activeTone === t.id ? t.accent : 'rgba(255,255,255,0.04)',
                  color: activeTone === t.id ? '#fff' : 'rgba(255,255,255,0.4)',
                  boxShadow: activeTone === t.id ? `0 0 0 1px ${t.border}` : 'none',
                  transition: 'all 0.15s',
                }}>
                  <span style={{ display: 'flex' }}>{t.icon}</span>{t.label}
                </button>
              ))}
              <div style={{ marginLeft: 'auto', display: 'flex', gap: 2 }}>
                {(['summary', 'captions'] as const).map(tab => (
                  <button key={tab} onClick={() => setActiveTab(tab)} style={{
                    padding: '5px 12px', borderRadius: 8, border: 'none', cursor: 'pointer',
                    fontSize: 11, fontWeight: activeTab === tab ? 600 : 400, fontFamily: 'inherit',
                    background: activeTab === tab ? 'rgba(255,255,255,0.1)' : 'transparent',
                    color: activeTab === tab ? '#fff' : 'rgba(255,255,255,0.35)', transition: 'all 0.15s',
                  }}>{tab === 'captions' ? 'Transcription' : 'Summary'}</button>
                ))}
              </div>
            </>
          ) : (
            <span style={{ color: 'rgba(255,255,255,0.2)', fontSize: 12 }}>
              {status === 'processing' ? 'Generating…' : 'Results will appear here'}
            </span>
          )}
        </div>

        {/* Content */}
        <div className="web-scroll" style={{ flex: 1, padding: '20px 24px', overflowY: 'auto' }}>
          {status === 'done' && results && activeResult ? (
            activeTab === 'summary' ? (
              <div style={{
                background: activeToneData.accent, border: `1px solid ${activeToneData.border}`,
                borderRadius: 16, padding: '20px 22px', maxWidth: 680,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                  <span style={{ display: 'flex', color: activeToneData.dot }}>{activeToneData.icon}</span>
                  <span style={{ color: '#fff', fontWeight: 600, fontSize: 14 }}>{activeToneData.label} Summary</span>
                </div>
                <p style={{ color: 'rgba(255,255,255,0.75)', fontSize: 13, lineHeight: 1.8, margin: 0, whiteSpace: 'pre-wrap' }}>
                  {activeResult.summary}
                </p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', maxWidth: 680 }}>
                {(activeResult.captions || '').split('\n').filter(Boolean).map((line, i, arr) => {
                  const match = line.match(/^(\d+:\d+(?:\.\d+)?(?:\s*[–\-]\s*|\s+))(.+)$/)
                  const timestamp = match ? match[1].trim().replace(/[–\-]/, '').trim() : null
                  const text = match ? match[2] : line
                  return (
                    <div key={i} style={{
                      display: 'flex', gap: 14, padding: '9px 0',
                      borderBottom: i < arr.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none',
                    }}>
                      {timestamp && (
                        <span style={{ color: activeToneData.dot, fontSize: 11, fontFamily: 'monospace', fontWeight: 600, flexShrink: 0, paddingTop: 2, minWidth: 40 }}>{timestamp}</span>
                      )}
                      <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, lineHeight: 1.65 }}>{text}</span>
                    </div>
                  )
                })}
                {!activeResult.captions && (
                  <div style={{ color: 'rgba(255,255,255,0.25)', fontSize: 13, padding: '16px 0' }}>No timestamped captions were generated.</div>
                )}
              </div>
            )
          ) : status !== 'processing' ? (
            <div className="web-empty-state">
              <svg width="40" height="40" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ opacity: 0.2 }}>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.723v6.554a1 1 0 01-1.447.894L15 14M4 8a2 2 0 012-2h9a2 2 0 012 2v8a2 2 0 01-2 2H6a2 2 0 01-2-2V8z" />
              </svg>
              <div>Upload a video or paste a URL,<br/>then hit Generate.</div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}

/* ── Usage Tracking panel ─────────────────────────────────────────────────── */

function UsageTrackingPanel() {
  const sessions = initSessions().sessions
  const totalMessages = sessions.reduce((a, s) => a + s.messages.filter(m => m.role === 'user').length, 0)
  const captionHistory = loadCaptionHistory()
  const totalTones = captionHistory.reduce((a, e) => a + Object.keys(e.results).length, 0)

  const stats = [
    { label: 'Chat Sessions',       value: sessions.length,    color: 'rgba(99,102,241,0.9)'  },
    { label: 'Messages Sent',        value: totalMessages,      color: 'rgba(52,211,153,0.9)'  },
    { label: 'Videos Summarized',   value: captionHistory.length, color: 'rgba(139,92,246,0.9)' },
    { label: 'Summaries Generated', value: totalTones,            color: 'rgba(245,158,11,0.9)'  },
  ]

  const modelInfo = [
    { model: 'Gemma 4 E4B',    role: 'Chat (simple messages)',          badge: 'Fast'     },
    { model: 'Gemma 4 26B',    role: 'Chat with tools (notes/widgets)', badge: 'Balanced' },
    { model: 'Gemma 4 31B IT', role: 'Video summaries',      badge: 'Powerful' },
  ]

  return (
    <div className="web-panel-main" style={{ padding: '28px 32px', overflowY: 'auto' }}>
      <div style={{ maxWidth: 560 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.02em', marginBottom: 6 }}>Usage Tracking</h2>
        <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.3)', marginBottom: 32 }}>Your activity in this session.</p>

        {/* Stats grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 32 }}>
          {stats.map(s => (
            <div key={s.label} style={{ padding: '16px 18px', borderRadius: 14, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.04em', color: s.color, marginBottom: 4, fontFamily: '"Montserrat", sans-serif' }}>{s.value}</div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)' }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Models section */}
        <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 12 }}>Model Routing</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {modelInfo.map(m => (
            <div key={m.model} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 12, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#fff', marginBottom: 2, fontFamily: 'monospace' }}>{m.model}</div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>{m.role}</div>
              </div>
              <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 6, background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.5)', letterSpacing: '0.05em' }}>{m.badge}</span>
            </div>
          ))}
        </div>

        {/* Provider */}
        <div style={{ marginTop: 24, padding: '12px 14px', borderRadius: 12, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#34d399', boxShadow: '0 0 6px rgba(52,211,153,0.6)', flexShrink: 0 }} />
          <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>All inference via <span style={{ color: 'rgba(255,255,255,0.7)', fontWeight: 600 }}>Fireworks AI</span> · AMD hardware</span>
        </div>
      </div>
    </div>
  )
}

/* ── Root WebApp component ────────────────────────────────────────────────── */
export default function WebApp() {
  const [activeId, setActiveId] = useState('home')
  const [activeNote, setActiveNote] = useState<Note | null>(null)

  // Build a web-native AppControl — no Electron APIs, just localStorage + events
  const appControl: AppControl = useMemo(() => {
    const NOTES_KEY = 'xo-notes'
    function loadN(): import('./types').Note[] {
      try { return JSON.parse(localStorage.getItem(NOTES_KEY) ?? '[]') } catch { return [] }
    }
    function saveN(notes: import('./types').Note[]) {
      localStorage.setItem(NOTES_KEY, JSON.stringify(notes))
      window.dispatchEvent(new CustomEvent('xo-notes-updated'))
    }
    function makeNote(title: string, content: string): import('./types').Note {
      const now = Date.now()
      return { id: now.toString() + Math.random().toString(36).slice(2), title, content, color: 'rgba(255,255,255,0.0)', createdAt: now, updatedAt: now }
    }
    return {
      // In the web app, "open widget" = navigate to that panel
      openWidget:      (id) => setActiveId(id === 'video' ? 'video' : id === 'settings' ? 'settings' : id),
      closeWidget:     (_id) => { /* no-op in web — can't hide panels */ },
      getOpenWidgets:  () => [activeId as import('./types').WidgetId].filter(Boolean),
      listNotes:       () => loadN(),
      getNote:         (id) => loadN().find(n => n.id === id),
      createNote:      (title, content) => {
        const n = makeNote(title, content)
        saveN([n, ...loadN()])
        return n
      },
      updateNote:      (id, patch) => {
        const notes = loadN()
        const idx = notes.findIndex(n => n.id === id)
        if (idx === -1) return null
        const updated = { ...notes[idx], ...patch, updatedAt: Date.now() }
        notes[idx] = updated
        saveN(notes)
        return updated
      },
      deleteNote:      (id) => {
        const notes = loadN()
        const next = notes.filter(n => n.id !== id)
        if (next.length === notes.length) return false
        saveN(next)
        return true
      },
      focusNote:       (id) => {
        window.dispatchEvent(new CustomEvent('xo-focus-note', { detail: { id } }))
      },
      getCaptionHistory: () => loadCaptionHistory(),
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId])

  function renderContent() {
    switch (activeId) {
      case 'chat':    return <WebChatPanel activeNote={activeNote} appControl={appControl} />
      case 'notes':   return <WebNotesPanel onNoteChange={setActiveNote} />
      case 'video':   return <WebVideoPanel />
      case 'usage':   return <UsageTrackingPanel />
      case 'settings':return <SettingsPanel />
      default:        return <HomePanel onNavigate={setActiveId} />
    }
  }

  return (
    <div className="web-shell">
      <div className="web-bg-glow-1" />
      <div className="web-bg-glow-2" />
      <Sidebar activeId={activeId} onSelect={setActiveId} />
      <main className="web-content">
        {renderContent()}
      </main>
    </div>
  )
}
