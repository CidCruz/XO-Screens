import { useState, useRef, useEffect } from 'react'
import type { Message, Note, ChatSession } from '../types'
import { sendToGeminiWithSystem } from '../gemini'
import {
  initSessions, newSession, upsertSession, saveSessions, deriveTitleFromMessage,
} from '../chatHistory'
import VoiceCall from './VoiceCall'

const corners = [
  { top: -6, left: -6,   dx: -1, dy: -1, rotate: 'rotate(180deg)', cursor: 'nwse-resize' },
  { top: -6, right: -6,  dx:  1, dy: -1, rotate: 'rotate(270deg)', cursor: 'nesw-resize' },
  { bottom: -6, left: -6,  dx: -1, dy:  1, rotate: 'rotate(90deg)',  cursor: 'nesw-resize' },
  { bottom: -6, right: -6, dx:  1, dy:  1, rotate: 'rotate(0deg)',   cursor: 'nwse-resize' },
]

interface Props {
  onClose?: () => void
  onCornerDown: (e: React.MouseEvent, dx: number, dy: number) => void
  activeNote?: Note | null
}

function timeAgo(ts: number) {
  const d = Date.now() - ts
  if (d < 60_000) return 'just now'
  if (d < 3_600_000) return `${Math.floor(d / 60_000)}m ago`
  if (d < 86_400_000) return `${Math.floor(d / 3_600_000)}h ago`
  return `${Math.floor(d / 86_400_000)}d ago`
}

export default function ChatBox({ onCornerDown, activeNote }: Props) {
  const [sessions, setSessions] = useState<ChatSession[]>(() => initSessions().sessions)
  const [activeId, setActiveId] = useState<string>(() => initSessions().active.id)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [voiceCall, setVoiceCall] = useState(false)
  const [closestCorner, setClosestCorner] = useState<number | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const activeSession = sessions.find(s => s.id === activeId) ?? sessions[0]
  const messages: Message[] = activeSession?.messages ?? []

  // Persist whenever sessions change
  useEffect(() => {
    saveSessions(sessions)
  }, [sessions])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  // Auto-resize textarea as content grows
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`
  }, [input])


  function handleNewChat() {
    const session = newSession()
    setSessions(prev => [session, ...prev])
    setActiveId(session.id)
    setHistoryOpen(false)
    setInput('')
  }

  function handleSelectSession(id: string) {
    setActiveId(id)
    setHistoryOpen(false)
    setInput('')
  }

  async function handleSend() {
    const text = input.trim()
    if (!text || loading) return

    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: text,
      timestamp: new Date(),
    }

    // Auto-title on first user message
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
    // Reset textarea height after send
    if (textareaRef.current) textareaRef.current.style.height = 'auto'

    try {
      const noteCtx = activeNote
        ? `The user has a note open titled "${activeNote.title || 'Untitled'}" with the following content:\n"""\n${activeNote.content || '(empty)'}\n"""\nYou are aware of this note and can reference or help with it if relevant.`
        : ''
      const systemPrompt = `You are XO, an intelligent desktop AI assistant. Be concise, helpful, and friendly.${noteCtx ? '\n\n' + noteCtx : ''}`
      const reply = await sendToGeminiWithSystem(updatedMessages, text, systemPrompt)
      const assistantMsg: Message = {
        id: Date.now().toString(),
        role: 'assistant',
        content: reply,
        timestamp: new Date(),
      }
      setSessions(prev => upsertSession(prev, {
        ...activeSession,
        title: newTitle,
        messages: [...updatedMessages, assistantMsg],
        updatedAt: Date.now(),
      }))
    } catch {
      const errMsg: Message = {
        id: Date.now().toString(),
        role: 'assistant',
        content: '⚠️ Failed to reach Gemini. Check your API key.',
        timestamp: new Date(),
      }
      setSessions(prev => upsertSession(prev, {
        ...activeSession,
        title: newTitle,
        messages: [...updatedMessages, errMsg],
        updatedAt: Date.now(),
      }))
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      {voiceCall && <VoiceCall onEnd={() => setVoiceCall(false)} />}
      <div
        ref={containerRef}
        style={{ position: 'relative', overflow: 'visible' }}
        onMouseMove={e => {
          if (!containerRef.current) return
          const r = containerRef.current.getBoundingClientRect()
          const x = e.clientX - r.left
          const y = e.clientY - r.top
          const pts = [
            { cx: 0,       cy: 0 },
            { cx: r.width, cy: 0 },
            { cx: 0,       cy: r.height },
            { cx: r.width, cy: r.height },
          ]
          let closest = -1
          let minDist = 14
          pts.forEach((p, i) => {
            const d = Math.hypot(x - p.cx, y - p.cy)
            if (d < minDist) { minDist = d; closest = i }
          })
          setClosestCorner(closest)
        }}
        onMouseLeave={() => setClosestCorner(null)}
      >
        {/* Corner handles */}
        {corners.map((c, i) => (
          <div
            key={i}
            onMouseDown={e => onCornerDown(e, c.dx, c.dy)}
            style={{
              position: 'absolute', width: 16, height: 16, zIndex: 10,
              top: (c as { top?: number }).top, left: (c as { left?: number }).left,
              right: (c as { right?: number }).right, bottom: (c as { bottom?: number }).bottom,
              cursor: c.cursor, display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <svg width="10" height="10" viewBox="0 0 10 10"
              style={{ opacity: closestCorner === i ? 0.35 : 0, transition: 'opacity 0.15s', pointerEvents: 'none', transform: c.rotate }}
            >
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

          {/* History drawer (slides in over the panel) */}
          {historyOpen && (
            <div style={{
              position: 'absolute', inset: 0, zIndex: 20,
              background: 'rgba(0,0,0,0.88)', backdropFilter: 'blur(16px)',
              WebkitBackdropFilter: 'blur(16px)',
              display: 'flex', flexDirection: 'column',
              borderRadius: 20, overflow: 'hidden',
              animation: 'fadeIn 0.15s ease',
            }}>
              {/* Drawer header */}
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '14px 16px', borderBottom: '1px solid rgba(255,255,255,0.08)', flexShrink: 0,
              }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#fff' }}>Chat History</span>
                <div style={{ display: 'flex', gap: 6 }}>
                  {/* New chat button */}
                  <button
                    onClick={handleNewChat}
                    title="New chat"
                    style={{
                      height: 28, padding: '0 10px', borderRadius: 8,
                      border: '1px solid rgba(255,255,255,0.15)',
                      background: 'rgba(255,255,255,0.08)', color: '#fff',
                      fontSize: 11, fontWeight: 600, cursor: 'pointer',
                      display: 'flex', alignItems: 'center', gap: 5,
                      transition: 'all 0.15s',
                    }}
                    onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.14)' }}
                    onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.08)' }}
                  >
                    <svg width="10" height="10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                    </svg>
                    New chat
                  </button>
                  {/* Close drawer */}
                  <button
                    onClick={() => setHistoryOpen(false)}
                    style={{
                      width: 28, height: 28, borderRadius: 8,
                      border: '1px solid rgba(255,255,255,0.1)',
                      background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.5)',
                      cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      transition: 'all 0.15s',
                    }}
                    onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.1)' }}
                    onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.05)' }}
                  >
                    <svg width="12" height="12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* Session list */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
                {sessions.length === 0 && (
                  <div style={{ padding: '20px 12px', textAlign: 'center', fontSize: 12, color: 'rgba(255,255,255,0.3)' }}>
                    No chats yet.
                  </div>
                )}
                {sessions.map(s => (
                  <button
                    key={s.id}
                    onClick={() => handleSelectSession(s.id)}
                    style={{
                      width: '100%', textAlign: 'left', padding: '10px 12px', borderRadius: 10,
                      background: s.id === activeId ? 'rgba(255,255,255,0.08)' : 'transparent',
                      border: s.id === activeId ? '1px solid rgba(255,255,255,0.12)' : '1px solid transparent',
                      cursor: 'pointer', transition: 'all 0.15s', marginBottom: 2,
                    }}
                    onMouseEnter={e => {
                      if (s.id !== activeId) (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.05)'
                    }}
                    onMouseLeave={e => {
                      if (s.id !== activeId) (e.currentTarget as HTMLButtonElement).style.background = 'transparent'
                    }}
                  >
                    <div style={{ fontSize: 12, fontWeight: s.id === activeId ? 600 : 400, color: s.id === activeId ? '#fff' : 'rgba(255,255,255,0.6)', marginBottom: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {s.title}
                    </div>
                    <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)' }}>
                      {s.messages.filter(m => m.role === 'user').length} message{s.messages.filter(m => m.role === 'user').length !== 1 ? 's' : ''} · {timeAgo(s.updatedAt)}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Header */}
          <div data-reset-widget style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '14px 16px', borderBottom: '1px solid rgba(255,255,255,0.08)', flexShrink: 0,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ color: '#fff', fontWeight: 900, fontSize: 14, letterSpacing: '-0.02em', textShadow: '0 0 12px rgba(255,255,255,0.9), 0 0 24px rgba(255,255,255,0.5)' }}>XO</span>
              <span style={{ color: 'rgba(255,255,255,0.25)', fontSize: 11, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {activeSession?.title ?? 'Assistant'}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {/* New chat icon */}
              <button
                data-no-drag
                onClick={handleNewChat}
                title="New chat"
                style={{
                  width: 28, height: 28, borderRadius: 8,
                  border: '1px solid rgba(255,255,255,0.1)',
                  background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.45)',
                  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'all 0.15s',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.1)'; (e.currentTarget as HTMLButtonElement).style.color = '#fff' }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.05)'; (e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.45)' }}
              >
                <svg width="12" height="12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                </svg>
              </button>
              {/* History icon */}
              <button
                data-no-drag
                onClick={() => setHistoryOpen(true)}
                title="Chat history"
                style={{
                  width: 28, height: 28, borderRadius: 8,
                  border: '1px solid rgba(255,255,255,0.1)',
                  background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.45)',
                  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'all 0.15s',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.1)'; (e.currentTarget as HTMLButtonElement).style.color = '#fff' }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.05)'; (e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.45)' }}
              >
                <svg width="13" height="13" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </button>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#34d399', display: 'inline-block' }} />
            </div>
          </div>

          {/* Messages */}
          <div className="chat-scroll" style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {messages.map(msg => (
              <div key={msg.id} className="fade-in" style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
                <div style={{
                  maxWidth: '78%', padding: '9px 13px', borderRadius: 14, fontSize: 12, lineHeight: 1.6,
                  ...(msg.role === 'user'
                    ? { background: 'rgba(255,255,255,0.1)', color: '#fff', border: '1px solid rgba(255,255,255,0.1)' }
                    : { color: 'rgba(255,255,255,0.7)' }),
                }}>
                  {msg.content}
                </div>
              </div>
            ))}
            {loading && (
              <div className="fade-in" style={{ display: 'flex', justifyContent: 'flex-start' }}>
                <div style={{ display: 'flex', gap: 4, alignItems: 'center', padding: '8px 4px' }}>
                  {[0, 150, 300].map(delay => (
                    <span key={delay} className="animate-bounce" style={{ width: 4, height: 4, borderRadius: '50%', background: 'rgba(255,255,255,0.35)', display: 'inline-block', animationDelay: `${delay}ms` }} />
                  ))}
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div style={{ padding: '12px 16px', borderTop: '1px solid rgba(255,255,255,0.08)', flexShrink: 0 }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
              <textarea
                ref={textareaRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
                placeholder="Ask anything..."
                rows={1}
                style={{
                  flex: 1, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 12, padding: '9px 13px', color: '#fff', fontSize: 12,
                  outline: 'none', resize: 'none', maxHeight: 120, fontFamily: 'inherit',
                  overflowY: 'auto', lineHeight: 1.5, boxSizing: 'border-box',
                }}
              />
              <button
                data-no-drag
                onClick={input.trim() ? handleSend : () => { window.xo?.setIgnoreMouse(false); setVoiceCall(true) }}
                disabled={loading}
                style={{
                  minHeight: 36, width: 42, borderRadius: 10, border: '1px solid rgba(255,255,255,0.1)',
                  background: '#fff', color: 'rgba(0,0,0,0.7)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer', flexShrink: 0, transition: 'all 0.15s',
                  alignSelf: 'flex-end', opacity: loading ? 0.3 : 1,
                  pointerEvents: 'auto',
                }}
              >
                {input.trim() ? (
                  <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24" style={{ transform: 'rotate(-45deg)' }}>
                    <path d="M2 21l21-9L2 3v7l15 2-15 2z" />
                  </svg>
                ) : (
                  <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2H3v2a9 9 0 0 0 8 8.94V23h2v-2.06A9 9 0 0 0 21 12v-2h-2z" />
                  </svg>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
