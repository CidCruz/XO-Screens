import { useState, useRef, useEffect } from 'react'
import type { Message, Note } from '../types'
import { sendToGeminiWithSystem } from '../gemini'
import VoiceCall from './VoiceCall'

const corners = [
  { top: -6, left: -6,   dx: -1, dy: -1, rotate: 'rotate(180deg)', cursor: 'nwse-resize' },
  { top: -6, right: -6,  dx:  1, dy: -1, rotate: 'rotate(270deg)', cursor: 'nesw-resize' },
  { bottom: -6, left: -6,  dx: -1, dy:  1, rotate: 'rotate(90deg)',  cursor: 'nesw-resize' },
  { bottom: -6, right: -6, dx:  1, dy:  1, rotate: 'rotate(0deg)',   cursor: 'nwse-resize' },
]

interface Props {
  onClose: () => void
  onCornerDown: (e: React.MouseEvent, dx: number, dy: number) => void
  activeNote?: Note | null
}

export default function ChatBox({ onClose, onCornerDown, activeNote }: Props) {
  const [messages, setMessages] = useState<Message[]>([
    { id: '0', role: 'assistant', content: "Hey! I'm XO, your AI assistant. How can I help you today?", timestamp: new Date() },
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [voiceCall, setVoiceCall] = useState(false)
  const [closestCorner, setClosestCorner] = useState<number | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  async function handleSend() {
    const text = input.trim()
    if (!text || loading) return
    const userMsg: Message = { id: Date.now().toString(), role: 'user', content: text, timestamp: new Date() }
    setMessages(prev => [...prev, userMsg])
    setInput('')
    setLoading(true)
    try {
      const noteCtx = activeNote
        ? `The user has a note open titled "${activeNote.title || 'Untitled'}" with the following content:\n"""\n${activeNote.content || '(empty)'}\n"""\nYou are aware of this note and can reference or help with it if relevant.`
        : ''
      const systemPrompt = `You are XO, an intelligent desktop AI assistant. Be concise, helpful, and friendly.${noteCtx ? '\n\n' + noteCtx : ''}`
      const reply = await sendToGeminiWithSystem(messages, text, systemPrompt)
      setMessages(prev => [...prev, { id: Date.now().toString(), role: 'assistant', content: reply, timestamp: new Date() }])
    } catch {
      setMessages(prev => [...prev, { id: Date.now().toString(), role: 'assistant', content: '⚠️ Failed to reach Gemini. Check your API key.', timestamp: new Date() }])
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
          { cx: 0,      cy: 0 },
          { cx: r.width, cy: 0 },
          { cx: 0,      cy: r.height },
          { cx: r.width, cy: r.height },
        ]
        let closest = -1
        let minDist = 14 // only show if within 14px
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
      }}>
        {/* Header */}
        <div data-reset-widget style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 16px', borderBottom: '1px solid rgba(255,255,255,0.08)', flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ color: '#fff', fontWeight: 900, fontSize: 14, letterSpacing: '-0.02em', textShadow: '0 0 12px rgba(255,255,255,0.9), 0 0 24px rgba(255,255,255,0.5)' }}>XO</span>
            <span style={{ color: 'rgba(255,255,255,0.25)', fontSize: 12 }}>Assistant</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
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
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
              placeholder="Ask anything..."
              rows={1}
              style={{
                flex: 1, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 12, padding: '9px 13px', color: '#fff', fontSize: 12,
                outline: 'none', resize: 'none', maxHeight: 100, fontFamily: 'inherit',
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
                alignSelf: 'stretch', opacity: loading ? 0.3 : 1,
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
