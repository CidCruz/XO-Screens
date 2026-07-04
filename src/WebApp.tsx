import { useState, useRef, useCallback, useEffect } from 'react'
import type { AppItem, Note } from './types'
import ChatBox from './components/ChatBox'
import NotesApp from './components/NotesApp'
import VoiceCall from './components/VoiceCall'

/* ── Nav items ────────────────────────────────────────────────────────────── */
const APPS: AppItem[] = [
  { id: 'home',     label: 'Home'      },
  { id: 'chat',     label: 'Assistant' },
  { id: 'notes',    label: 'Notes'     },
  { id: 'settings', label: 'Settings'  },
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
      desc: 'Chat with XO — text or live voice, powered by Gemini.',
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
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY
  const masked = apiKey ? `${apiKey.slice(0, 6)}${'•'.repeat(20)}` : 'Not set'

  return (
    <div className="web-panel-main" style={{ padding: '28px 32px', overflowY: 'auto' }}>
      <div style={{ maxWidth: 520 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.02em', marginBottom: 6 }}>Settings</h2>
        <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.3)', marginBottom: 32 }}>Configure your XO Screens workspace.</p>

        {/* API key section */}
        <div style={{ marginBottom: 28 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 12 }}>
            Gemini API
          </div>
          <div style={{
            padding: '14px 16px', borderRadius: 12,
            background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
          }}>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginBottom: 6 }}>API Key</div>
            <div style={{
              fontFamily: 'monospace', fontSize: 12,
              color: apiKey ? 'rgba(52,211,153,0.85)' : 'rgba(239,68,68,0.8)',
              wordBreak: 'break-all',
            }}>{masked}</div>
            {!apiKey && (
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginTop: 8 }}>
                Set <code style={{ background: 'rgba(255,255,255,0.07)', padding: '1px 5px', borderRadius: 4 }}>VITE_GEMINI_API_KEY</code> in your <code style={{ background: 'rgba(255,255,255,0.07)', padding: '1px 5px', borderRadius: 4 }}>.env.local</code> file.
              </div>
            )}
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
              { label: 'Model', value: 'gemini-2.5-flash' },
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
import { sendToGeminiWithSystem } from './gemini'
import type { Message } from './types'

function WebChatPanel() {
  const [messages, setMessages] = useState<Message[]>([
    { id: '0', role: 'assistant', content: "Hey! I'm XO, your AI assistant. How can I help you today?", timestamp: new Date() },
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [voiceCall, setVoiceCall] = useState(false)
  const [activeNote, setActiveNote] = useState<Note | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  // Auto-resize textarea
  useEffect(() => {
    const ta = textareaRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = `${Math.min(ta.scrollHeight, 120)}px`
  }, [input])

  async function handleSend() {
    const text = input.trim()
    if (!text || loading) return
    const userMsg: Message = { id: Date.now().toString(), role: 'user', content: text, timestamp: new Date() }
    setMessages(prev => [...prev, userMsg])
    setInput('')
    setLoading(true)
    try {
      const noteCtx = activeNote
        ? `The user has a note open titled "${activeNote.title || 'Untitled'}" with content:\n"""\n${activeNote.content || '(empty)'}\n"""\nYou can reference it if relevant.`
        : ''
      const systemPrompt = `You are XO, an intelligent AI assistant running as a web app. Be concise, helpful, and friendly.${noteCtx ? '\n\n' + noteCtx : ''}`
      const reply = await sendToGeminiWithSystem(messages, text, systemPrompt)
      setMessages(prev => [...prev, { id: Date.now().toString(), role: 'assistant', content: reply, timestamp: new Date() }])
    } catch {
      setMessages(prev => [...prev, { id: Date.now().toString(), role: 'assistant', content: '⚠️ Failed to reach Gemini. Check your API key in .env.local.', timestamp: new Date() }])
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      {voiceCall && <VoiceCall onEnd={() => setVoiceCall(false)} />}
      <div className="web-panel-main">
        {/* Header */}
        <div className="web-panel-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{
              color: '#fff', fontWeight: 900, fontSize: 15, letterSpacing: '-0.03em',
              textShadow: '0 0 12px rgba(255,255,255,0.8), 0 0 24px rgba(255,255,255,0.4)',
            }}>XO</span>
            <span className="web-panel-subtitle">Assistant</span>
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
            <div className="status-dot" />
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>Gemini 2.5</span>
          </div>
        </div>

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
            display: 'flex', gap: 10, alignItems: 'flex-end',
            background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.09)',
            borderRadius: 16, padding: '10px 12px',
          }}>
            <textarea
              ref={textareaRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
              placeholder="Ask anything… (Enter to send)"
              rows={1}
              style={{
                flex: 1, background: 'transparent', border: 'none', outline: 'none',
                color: '#fff', fontSize: 13, lineHeight: 1.6,
                resize: 'none', fontFamily: 'inherit', maxHeight: 120,
              }}
            />
            <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
              {/* Voice button */}
              <button
                onClick={() => setVoiceCall(true)}
                title="Voice call"
                style={{
                  width: 34, height: 34, borderRadius: 10, border: '1px solid rgba(255,255,255,0.1)',
                  background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.4)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                  transition: 'all 0.15s', flexShrink: 0,
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(52,211,153,0.12)'; (e.currentTarget as HTMLButtonElement).style.color = '#34d399' }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.05)'; (e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.4)' }}
              >
                <svg width="15" height="15" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2H3v2a9 9 0 0 0 8 8.94V23h2v-2.06A9 9 0 0 0 21 12v-2h-2z"/>
                </svg>
              </button>
              {/* Send button */}
              <button
                onClick={handleSend}
                disabled={!input.trim() || loading}
                style={{
                  width: 34, height: 34, borderRadius: 10,
                  background: input.trim() && !loading ? '#fff' : 'rgba(255,255,255,0.07)',
                  border: 'none', cursor: input.trim() && !loading ? 'pointer' : 'default',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: input.trim() && !loading ? 'rgba(0,0,0,0.7)' : 'rgba(255,255,255,0.25)',
                  transition: 'all 0.15s', flexShrink: 0,
                }}
              >
                <svg width="15" height="15" fill="currentColor" viewBox="0 0 24 24" style={{ transform: 'rotate(-45deg)' }}>
                  <path d="M2 21l21-9L2 3v7l15 2-15 2z"/>
                </svg>
              </button>
            </div>
          </div>
          <div style={{ marginTop: 8, fontSize: 10, color: 'rgba(255,255,255,0.2)', paddingLeft: 2 }}>
            Shift+Enter for newline
          </div>
        </div>
      </div>
    </>
  )
}

/* ── Web-native notes wrapper ─────────────────────────────────────────────── */
function WebNotesPanel() {
  // NotesApp expects onCornerDown (desktop drag) — pass a no-op for web
  const noOp = useCallback(() => {}, [])

  return (
    <div className="web-panel-main" style={{ position: 'relative' }}>
      <div style={{
        position: 'absolute', inset: 0,
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        {/* Reuse the existing NotesApp, adapted for full panel height */}
        <WebNotesInner />
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

function WebNotesInner() {
  const [notes, setNotes] = useStateN<Note[]>(() => { const l = loadNotes(); return l.length ? l : [newNoteObj()] })
  const [activeId, setActiveId] = useStateN<string>(() => { const l = loadNotes(); return l.length ? l[0].id : '' })
  const [confirmDeleteId, setConfirmDeleteId] = useStateN<string | null>(null)
  const titleRef = useRefN<HTMLInputElement>(null)

  useEffectN(() => { saveNotesLocal(notes) }, [notes])

  const activeNote = notes.find(n => n.id === activeId) ?? notes[0]
  const activeColor = activeNote ? colorFromBg(activeNote.color) : NOTE_COLORS[0]
  const wordCount = activeNote ? activeNote.content.trim().split(/\s+/).filter(Boolean).length : 0

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

/* ── Root WebApp component ────────────────────────────────────────────────── */
export default function WebApp() {
  const [activeId, setActiveId] = useState('home')

  function renderContent() {
    switch (activeId) {
      case 'chat':     return <WebChatPanel />
      case 'notes':    return <WebNotesPanel />
      case 'settings': return <SettingsPanel />
      default:         return <HomePanel onNavigate={setActiveId} />
    }
  }

  return (
    <div className="web-shell">
      {/* Ambient glow */}
      <div className="web-bg-glow-1" />
      <div className="web-bg-glow-2" />

      {/* Sidebar */}
      <Sidebar activeId={activeId} onSelect={setActiveId} />

      {/* Main content */}
      <main className="web-content">
        {renderContent()}
      </main>
    </div>
  )
}
