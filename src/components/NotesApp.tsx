import { useState, useRef, useEffect, useCallback } from 'react'
import type { Note, Message } from '../types'
import { sendToGeminiWithSystem } from '../gemini'

const STORAGE_KEY = 'xo-notes'
const NOTE_COLORS = [
  'rgba(255,255,255,0.07)',
  'rgba(139,92,246,0.18)',
  'rgba(59,130,246,0.18)',
  'rgba(16,185,129,0.18)',
  'rgba(245,158,11,0.18)',
  'rgba(239,68,68,0.18)',
]

function loadNotes(): Note[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function saveNotes(notes: Note[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(notes))
}

function newNote(): Note {
  return {
    id: Date.now().toString(),
    title: '',
    content: '',
    color: NOTE_COLORS[0],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
}

const corners = [
  { top: -6, left: -6,   dx: -1, dy: -1, rotate: 'rotate(180deg)', cursor: 'nwse-resize' },
  { top: -6, right: -6,  dx:  1, dy: -1, rotate: 'rotate(270deg)', cursor: 'nesw-resize' },
  { bottom: -6, left: -6,  dx: -1, dy:  1, rotate: 'rotate(90deg)',  cursor: 'nesw-resize' },
  { bottom: -6, right: -6, dx:  1, dy:  1, rotate: 'rotate(0deg)',   cursor: 'nwse-resize' },
]

interface Props {
  onClose: () => void
  onCornerDown: (e: React.MouseEvent, dx: number, dy: number) => void
}

export default function NotesApp({ onClose, onCornerDown }: Props) {
  const [notes, setNotes] = useState<Note[]>(() => {
    const loaded = loadNotes()
    return loaded.length > 0 ? loaded : [newNote()]
  })
  const [activeId, setActiveId] = useState<string>(() => {
    const loaded = loadNotes()
    return loaded.length > 0 ? loaded[0].id : notes[0]?.id ?? ''
  })
  const [aiOpen, setAiOpen] = useState(false)
  const [aiMessages, setAiMessages] = useState<Message[]>([])
  const [aiInput, setAiInput] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [closestCorner, setClosestCorner] = useState<number | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const aiBottomRef = useRef<HTMLDivElement>(null)
  const titleRef = useRef<HTMLInputElement>(null)

  const activeNote = notes.find(n => n.id === activeId) ?? notes[0]

  useEffect(() => { saveNotes(notes) }, [notes])

  useEffect(() => {
    aiBottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [aiMessages, aiLoading])

  const updateNote = useCallback((id: string, patch: Partial<Note>) => {
    setNotes(prev => prev.map(n => n.id === id ? { ...n, ...patch, updatedAt: Date.now() } : n))
  }, [])

  function addNote() {
    const n = newNote()
    setNotes(prev => [n, ...prev])
    setActiveId(n.id)
    setTimeout(() => titleRef.current?.focus(), 50)
  }

  function deleteNote(id: string) {
    setNotes(prev => {
      const next = prev.filter(n => n.id !== id)
      if (next.length === 0) {
        const fresh = newNote()
        setActiveId(fresh.id)
        return [fresh]
      }
      if (activeId === id) setActiveId(next[0].id)
      return next
    })
  }

  function cycleColor(id: string) {
    const note = notes.find(n => n.id === id)
    if (!note) return
    const idx = NOTE_COLORS.indexOf(note.color)
    const next = NOTE_COLORS[(idx + 1) % NOTE_COLORS.length]
    updateNote(id, { color: next })
  }

  async function handleAiSend() {
    const text = aiInput.trim()
    if (!text || aiLoading) return
    const userMsg: Message = { id: Date.now().toString(), role: 'user', content: text, timestamp: new Date() }
    const next = [...aiMessages, userMsg]
    setAiMessages(next)
    setAiInput('')
    setAiLoading(true)
    const noteContext = activeNote
      ? `The user is currently editing a note titled "${activeNote.title || 'Untitled'}". Note content:\n"""\n${activeNote.content || '(empty)'}\n"""\n\n`
      : ''
    const systemPrompt = `You are XO, an intelligent desktop AI assistant integrated into a notes app. ${noteContext}Help the user brainstorm, expand, summarize, or improve their notes. Be concise and direct.`
    try {
      const reply = await sendToGeminiWithSystem(aiMessages, text, systemPrompt)
      setAiMessages(prev => [...prev, { id: Date.now().toString(), role: 'assistant', content: reply, timestamp: new Date() }])
    } catch {
      setAiMessages(prev => [...prev, { id: Date.now().toString(), role: 'assistant', content: '⚠️ Failed to reach XO. Check your API key.', timestamp: new Date() }])
    } finally {
      setAiLoading(false)
    }
  }

  async function handleInsertSuggestion() {
    const last = [...aiMessages].reverse().find(m => m.role === 'assistant')
    if (!last || !activeNote) return
    updateNote(activeNote.id, {
      content: activeNote.content
        ? activeNote.content + '\n\n' + last.content
        : last.content,
    })
  }

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

      <div style={{
        width: 380, display: 'flex', flexDirection: 'column',
        background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(24px) saturate(200%)',
        WebkitBackdropFilter: 'blur(24px) saturate(200%)',
        border: '1px solid rgba(255,255,255,0.1)', borderRadius: 20,
        overflow: 'hidden', boxShadow: '0 24px 60px rgba(0,0,0,0.5)',
        maxHeight: '80vh',
      }}>

        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 16px', borderBottom: '1px solid rgba(255,255,255,0.08)', flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ color: '#fff', fontWeight: 900, fontSize: 14, letterSpacing: '-0.02em', textShadow: '0 0 12px rgba(255,255,255,0.9), 0 0 24px rgba(255,255,255,0.5)' }}>XO</span>
            <span style={{ color: 'rgba(255,255,255,0.25)', fontSize: 12 }}>Notes</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {/* AI toggle */}
            <button data-no-drag onClick={() => setAiOpen(v => !v)}
              title="Ask XO about this note"
              style={{
                width: 28, height: 28, borderRadius: 10, border: 'none', cursor: 'pointer', transition: 'all 0.15s',
                background: aiOpen ? 'rgba(139,92,246,0.35)' : 'transparent',
                color: aiOpen ? 'rgba(139,92,246,1)' : 'rgba(255,255,255,0.3)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
              onMouseEnter={e => { if (!aiOpen) { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.1)'; (e.currentTarget as HTMLButtonElement).style.color = '#fff' } }}
              onMouseLeave={e => { if (!aiOpen) { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; (e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.3)' } }}
            >
              <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
            </button>
            {/* New note */}
            <button data-no-drag onClick={addNote}
              title="New note"
              style={{ width: 28, height: 28, borderRadius: 10, border: 'none', background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.3)', cursor: 'pointer', transition: 'all 0.15s' }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.1)'; (e.currentTarget as HTMLButtonElement).style.color = '#fff' }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; (e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.3)' }}
            >
              <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            </button>
            {/* Close */}
            <button data-no-drag onClick={onClose}
              style={{ width: 28, height: 28, borderRadius: 10, border: 'none', background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.3)', cursor: 'pointer', transition: 'all 0.15s' }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.1)'; (e.currentTarget as HTMLButtonElement).style.color = '#fff' }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; (e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.3)' }}
            >
              <svg width="12" height="12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', flex: 1, overflow: 'hidden', minHeight: 0 }}>
          {/* Sidebar: note list */}
          <div className="chat-scroll" style={{
            width: 130, flexShrink: 0, borderRight: '1px solid rgba(255,255,255,0.06)',
            overflowY: 'auto', padding: '8px 6px', display: 'flex', flexDirection: 'column', gap: 4,
          }}>
            {notes.map(n => (
              <button
                key={n.id}
                data-no-drag
                onClick={() => setActiveId(n.id)}
                style={{
                  width: '100%', textAlign: 'left', padding: '8px 10px', borderRadius: 10,
                  border: n.id === activeId ? '1px solid rgba(255,255,255,0.2)' : '1px solid transparent',
                  background: n.id === activeId ? (n.color !== NOTE_COLORS[0] ? n.color : 'rgba(255,255,255,0.08)') : n.color,
                  cursor: 'pointer', transition: 'all 0.15s',
                }}
              >
                <div style={{ color: '#fff', fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {n.title || 'Untitled'}
                </div>
                <div style={{ color: 'rgba(255,255,255,0.35)', fontSize: 10, marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {n.content ? n.content.slice(0, 30) : 'Empty note'}
                </div>
              </button>
            ))}
          </div>

          {/* Editor */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}>
            {activeNote && (
              <>
                {/* Note toolbar */}
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '6px 12px', borderBottom: '1px solid rgba(255,255,255,0.06)', flexShrink: 0,
                }}>
                  <div style={{ display: 'flex', gap: 4 }}>
                    {NOTE_COLORS.map(c => (
                      <button key={c} data-no-drag onClick={() => updateNote(activeNote.id, { color: c })}
                        style={{
                          width: 14, height: 14, borderRadius: '50%', border: activeNote.color === c ? '2px solid rgba(255,255,255,0.6)' : '2px solid transparent',
                          background: c === NOTE_COLORS[0] ? 'rgba(255,255,255,0.2)' : c, cursor: 'pointer', padding: 0,
                          transition: 'border 0.15s',
                        }}
                      />
                    ))}
                  </div>
                  <button data-no-drag onClick={() => deleteNote(activeNote.id)}
                    title="Delete note"
                    style={{ width: 22, height: 22, borderRadius: 6, border: 'none', background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.2)', cursor: 'pointer', transition: 'all 0.15s' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = '#f87171'; (e.currentTarget as HTMLButtonElement).style.background = 'rgba(239,68,68,0.1)' }}
                    onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.2)'; (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
                  >
                    <svg width="12" height="12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
                {/* Title */}
                <input
                  ref={titleRef}
                  data-no-drag
                  value={activeNote.title}
                  onChange={e => updateNote(activeNote.id, { title: e.target.value })}
                  placeholder="Note title..."
                  style={{
                    flexShrink: 0, background: 'transparent', border: 'none', outline: 'none',
                    color: '#fff', fontSize: 13, fontWeight: 700, padding: '10px 14px 4px',
                    fontFamily: 'inherit', width: '100%',
                  }}
                />
                {/* Body */}
                <textarea
                  data-no-drag
                  value={activeNote.content}
                  onChange={e => updateNote(activeNote.id, { content: e.target.value })}
                  placeholder="Start writing..."
                  className="chat-scroll"
                  style={{
                    flex: 1, background: 'transparent', border: 'none', outline: 'none', resize: 'none',
                    color: 'rgba(255,255,255,0.75)', fontSize: 12, lineHeight: 1.7,
                    padding: '6px 14px 14px', fontFamily: 'inherit', overflowY: 'auto',
                  }}
                />
              </>
            )}
          </div>
        </div>

        {/* XO AI Panel */}
        {aiOpen && (
          <div style={{
            borderTop: '1px solid rgba(139,92,246,0.25)',
            display: 'flex', flexDirection: 'column', flexShrink: 0,
            background: 'rgba(139,92,246,0.06)',
            maxHeight: 240,
          }}>
            {/* AI header */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '8px 14px', borderBottom: '1px solid rgba(139,92,246,0.15)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ color: 'rgba(139,92,246,1)', fontWeight: 700, fontSize: 11, letterSpacing: '-0.01em' }}>XO Assistant</span>
                <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#34d399', display: 'inline-block' }} />
              </div>
              {aiMessages.length > 0 && (
                <button data-no-drag onClick={handleInsertSuggestion}
                  title="Insert last suggestion into note"
                  style={{
                    fontSize: 10, color: 'rgba(139,92,246,0.8)', background: 'rgba(139,92,246,0.15)',
                    border: '1px solid rgba(139,92,246,0.3)', borderRadius: 6, padding: '3px 8px', cursor: 'pointer',
                    transition: 'all 0.15s',
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(139,92,246,0.3)' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(139,92,246,0.15)' }}
                >
                  ↑ Insert into note
                </button>
              )}
            </div>
            {/* AI messages */}
            <div className="chat-scroll" style={{ flex: 1, overflowY: 'auto', padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 8, minHeight: 0, maxHeight: 150 }}>
              {aiMessages.length === 0 && (
                <p style={{ color: 'rgba(255,255,255,0.2)', fontSize: 11, fontStyle: 'italic' }}>
                  Ask XO to summarize, expand, or improve this note…
                </p>
              )}
              {aiMessages.map(msg => (
                <div key={msg.id} className="fade-in" style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
                  <div style={{
                    maxWidth: '85%', padding: '7px 11px', borderRadius: 12, fontSize: 11, lineHeight: 1.6,
                    ...(msg.role === 'user'
                      ? { background: 'rgba(255,255,255,0.1)', color: '#fff', border: '1px solid rgba(255,255,255,0.1)' }
                      : { color: 'rgba(255,255,255,0.75)' }),
                  }}>
                    {msg.content}
                  </div>
                </div>
              ))}
              {aiLoading && (
                <div className="fade-in" style={{ display: 'flex', gap: 4, alignItems: 'center', padding: '4px 0' }}>
                  {[0, 150, 300].map(d => (
                    <span key={d} className="animate-bounce" style={{ width: 4, height: 4, borderRadius: '50%', background: 'rgba(139,92,246,0.5)', display: 'inline-block', animationDelay: `${d}ms` }} />
                  ))}
                </div>
              )}
              <div ref={aiBottomRef} />
            </div>
            {/* AI input */}
            <div style={{ padding: '8px 12px', borderTop: '1px solid rgba(139,92,246,0.12)', flexShrink: 0 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                <textarea
                  data-no-drag
                  value={aiInput}
                  onChange={e => setAiInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAiSend() } }}
                  placeholder="Ask XO about this note…"
                  rows={1}
                  style={{
                    flex: 1, background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.25)',
                    borderRadius: 10, padding: '7px 11px', color: '#fff', fontSize: 11,
                    outline: 'none', resize: 'none', maxHeight: 80, fontFamily: 'inherit',
                  }}
                />
                <button data-no-drag onClick={handleAiSend} disabled={!aiInput.trim() || aiLoading}
                  style={{
                    width: 34, height: 34, borderRadius: 10, border: '1px solid rgba(139,92,246,0.4)',
                    background: 'rgba(139,92,246,0.25)', color: 'rgba(139,92,246,1)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    cursor: aiInput.trim() && !aiLoading ? 'pointer' : 'not-allowed',
                    flexShrink: 0, opacity: !aiInput.trim() || aiLoading ? 0.4 : 1,
                    transition: 'all 0.15s', alignSelf: 'stretch',
                  }}
                >
                  <svg width="14" height="14" fill="currentColor" viewBox="0 0 24 24" style={{ transform: 'rotate(-45deg)' }}>
                    <path d="M2 21l21-9L2 3v7l15 2-15 2z" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
