import { useState, useRef, useEffect, useCallback } from 'react'
import type { Note } from '../types'
import { trackNoteCreated, trackNoteEdited, trackNoteDeleted, trackFeatureUsage } from '../usageTracking'

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
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

function saveNotes(notes: Note[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(notes))
}

function newNote(): Note {
  return {
    id: Date.now().toString(),
    title: '',
    content: '',
    color: NOTE_COLORS[0].bg,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
}

function timeAgo(ts: number) {
  const diff = Date.now() - ts
  if (diff < 60_000) return 'just now'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
  return `${Math.floor(diff / 86_400_000)}d ago`
}

const corners = [
  { top: -6,    left: -6,   dx: -1, dy: -1, rotate: 'rotate(180deg)', cursor: 'nwse-resize' },
  { top: -6,    right: -6,  dx:  1, dy: -1, rotate: 'rotate(270deg)', cursor: 'nesw-resize' },
  { bottom: -6, left: -6,   dx: -1, dy:  1, rotate: 'rotate(90deg)',  cursor: 'nesw-resize' },
  { bottom: -6, right: -6,  dx:  1, dy:  1, rotate: 'rotate(0deg)',   cursor: 'nwse-resize' },
]

interface Props {
  onClose: () => void
  onCornerDown: (e: React.MouseEvent, dx: number, dy: number) => void
  onNoteChange?: (note: Note | null) => void
}

export default function NotesApp({ onClose: _onClose, onCornerDown, onNoteChange }: Props) {
  const [notes, setNotes] = useState<Note[]>(() => {
    const loaded = loadNotes()
    return loaded.length > 0 ? loaded : [newNote()]
  })
  const [activeId, setActiveId] = useState<string>(() => {
    const loaded = loadNotes()
    return loaded.length > 0 ? loaded[0].id : ''
  })
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [closestCorner, setClosestCorner] = useState<number | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [height, setHeight] = useState(300)
  const [heightAnimating, setHeightAnimating] = useState(false)
  const bottomDragStart = useRef<{ y: number; h: number } | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const titleRef = useRef<HTMLInputElement>(null)

  const activeNote = notes.find(n => n.id === activeId) ?? notes[0]
  const activeColor = activeNote ? colorFromBg(activeNote.color) : NOTE_COLORS[0]

  useEffect(() => { saveNotes(notes) }, [notes])

  // Refresh notes when another widget (e.g. VideoCaptionsApp or AppControl) saves to localStorage
  useEffect(() => {
    function handleNotesUpdated() {
      const fresh = loadNotes()
      setNotes(fresh.length > 0 ? fresh : [newNote()])
      setActiveId(prev => {
        // Keep the current note selected if it still exists, otherwise jump to the newest
        return fresh.some(n => n.id === prev) ? prev : (fresh[0]?.id ?? '')
      })
    }
    window.addEventListener('xo-notes-updated', handleNotesUpdated)
    return () => window.removeEventListener('xo-notes-updated', handleNotesUpdated)
  }, [])

  // Focus a specific note when the chat tool calls focusNote()
  useEffect(() => {
    function handleFocusNote(e: Event) {
      const id = (e as CustomEvent<{ id: string }>).detail?.id
      if (!id) return
      // Reload notes first in case the note was just created
      const fresh = loadNotes()
      if (fresh.some(n => n.id === id)) {
        setNotes(fresh)
        setActiveId(id)
        setConfirmDeleteId(null)
      }
    }
    window.addEventListener('xo-focus-note', handleFocusNote)
    return () => window.removeEventListener('xo-focus-note', handleFocusNote)
  }, [])

  // Keep parent (ChatBox) informed of the active note
  useEffect(() => {
    onNoteChange?.(activeNote ?? null)
  }, [activeNote, onNoteChange])

  const updateNote = useCallback((id: string, patch: Partial<Note>) => {
    setNotes(prev => prev.map(n => {
      if (n.id !== id) return n
      if (patch.content !== undefined && patch.content !== n.content) {
        const oldWC = n.content.trim().split(/\s+/).filter(Boolean).length
        const newWC = patch.content.trim().split(/\s+/).filter(Boolean).length
        trackNoteEdited(oldWC, newWC)
      }
      return { ...n, ...patch, updatedAt: Date.now() }
    }))
  }, [])

  function addNote() {
    const n = newNote()
    setNotes(prev => [n, ...prev])
    setActiveId(n.id)
    setConfirmDeleteId(null)
    trackNoteCreated(0)
    trackFeatureUsage('notes')
    setTimeout(() => titleRef.current?.focus(), 50)
  }

  function deleteNote(id: string) {
    setNotes(prev => {
      const target = prev.find(n => n.id === id)
      if (target) {
        const wc = target.content.trim().split(/\s+/).filter(Boolean).length
        trackNoteDeleted(wc)
        trackFeatureUsage('notes')
      }
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

  const wordCount = activeNote
    ? activeNote.content.trim().split(/\s+/).filter(Boolean).length
    : 0

  function onBottomDragDown(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    setHeightAnimating(false)
    bottomDragStart.current = { y: e.clientY, h: height }
    window.xo?.setIgnoreMouse(false)

    function onMove(ev: MouseEvent) {
      if (!bottomDragStart.current) return
      const newH = Math.max(200, Math.min(700, bottomDragStart.current.h + ev.clientY - bottomDragStart.current.y))
      setHeight(newH)
    }
    function onUp() {
      bottomDragStart.current = null
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
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
      {/* Resize corners */}
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
        width: 420,
        height: height,
        display: 'flex',
        flexDirection: 'column',
        background: 'rgba(10,10,12,0.82)',
        backdropFilter: 'blur(32px) saturate(180%)',
        WebkitBackdropFilter: 'blur(32px) saturate(180%)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 22,
        overflow: 'hidden',
        boxShadow: '0 32px 80px rgba(0,0,0,0.6), 0 0 0 0.5px rgba(255,255,255,0.05) inset',
        transition: heightAnimating ? 'height 0.35s cubic-bezier(0.34,1.56,0.64,1)' : 'none',
      }}>

        {/* ── Top bar ── */}
        <div data-reset-widget onDoubleClick={() => { setHeightAnimating(true); setHeight(300) }} style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '12px 14px',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          flexShrink: 0,
        }}>
          <span style={{
            color: '#fff', fontWeight: 900, fontSize: 13,
            letterSpacing: '-0.03em',
            textShadow: '0 0 10px rgba(255,255,255,0.8)',
            flexShrink: 0,
          }}>XO</span>
          <span style={{ color: 'rgba(255,255,255,0.18)', fontSize: 11, flexShrink: 0 }}>Notes</span>

          {/* Sidebar toggle */}
          <button data-no-drag onClick={() => setSidebarOpen(v => !v)} title="Toggle list"
            style={{ width: 22, height: 22, borderRadius: 6, border: 'none', background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', color: sidebarOpen ? 'rgba(255,255,255,0.4)' : 'rgba(255,255,255,0.2)', cursor: 'pointer', transition: 'all 0.15s', flexShrink: 0 }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = '#fff'; (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.08)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = sidebarOpen ? 'rgba(255,255,255,0.4)' : 'rgba(255,255,255,0.2)'; (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
          >
            <svg width="13" height="13" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" />
            </svg>
          </button>

          <div style={{ flex: 1 }} />

          {/* Color swatches */}
          {activeNote && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              {NOTE_COLORS.map(c => (
                <button
                  key={c.bg}
                  data-no-drag
                  onClick={() => updateNote(activeNote.id, { color: c.bg })}
                  style={{
                    width: 10, height: 10, borderRadius: '50%', padding: 0,
                    border: activeNote.color === c.bg ? `2px solid ${c.dot}` : '2px solid transparent',
                    background: c.dot,
                    cursor: 'pointer',
                    transform: activeNote.color === c.bg ? 'scale(1.25)' : 'scale(1)',
                    transition: 'transform 0.15s, border 0.15s',
                    flexShrink: 0,
                  }}
                />
              ))}
            </div>
          )}

          {/* Divider */}
          <div style={{ width: 1, height: 16, background: 'rgba(255,255,255,0.08)', flexShrink: 0 }} />

          {/* Delete / confirm */}
          {activeNote && (
            confirmDeleteId === activeNote.id ? (
              <div data-no-drag style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', whiteSpace: 'nowrap' }}>Delete?</span>
                <button data-no-drag onClick={() => { deleteNote(activeNote.id); setConfirmDeleteId(null) }}
                  style={{ fontSize: 10, fontWeight: 600, color: '#f87171', background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 6, padding: '3px 8px', cursor: 'pointer', transition: 'all 0.15s' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(239,68,68,0.3)' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(239,68,68,0.15)' }}
                >Yes</button>
                <button data-no-drag onClick={() => setConfirmDeleteId(null)}
                  style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, padding: '3px 8px', cursor: 'pointer', transition: 'all 0.15s' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.12)' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.06)' }}
                >No</button>
              </div>
            ) : (
              <button data-no-drag onClick={() => setConfirmDeleteId(activeNote.id)} title="Delete note"
                style={{ width: 26, height: 26, borderRadius: 8, border: 'none', background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.25)', cursor: 'pointer', transition: 'all 0.15s', flexShrink: 0 }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = '#f87171'; (e.currentTarget as HTMLButtonElement).style.background = 'rgba(239,68,68,0.12)' }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.25)'; (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
              >
                <svg width="12" height="12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            )
          )}

          {/* New note */}
          <button data-no-drag onClick={addNote} title="New note"
            style={{ width: 26, height: 26, borderRadius: 8, border: 'none', background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.25)', cursor: 'pointer', transition: 'all 0.15s', flexShrink: 0 }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.08)'; (e.currentTarget as HTMLButtonElement).style.color = '#fff' }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; (e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.25)' }}
          >
            <svg width="13" height="13" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </button>
        </div>

        {/* ── Body: sidebar + editor ── */}
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden', minHeight: 0 }}>

          {/* Sidebar */}
          <div className="chat-scroll" style={{
            width: sidebarOpen ? 136 : 0,
            flexShrink: 0,
            borderRight: sidebarOpen ? '1px solid rgba(255,255,255,0.05)' : 'none',
            overflowY: sidebarOpen ? 'auto' : 'hidden',
            overflowX: 'hidden',
            padding: sidebarOpen ? '10px 8px' : '0',
            display: 'flex', flexDirection: 'column', gap: 3,
            background: 'rgba(0,0,0,0.15)',
            transition: 'width 0.2s ease, padding 0.2s ease',
          }}>
            {notes.map(n => {
              const nc = colorFromBg(n.color)
              const isActive = n.id === activeId
              return (
                <button
                  key={n.id}
                  data-no-drag
                  onClick={() => { setActiveId(n.id); setConfirmDeleteId(null) }}
                  style={{
                    width: '100%', textAlign: 'left',
                    padding: '9px 10px', borderRadius: 11,
                    border: isActive ? `1px solid ${nc.dot.replace('0.9', '0.35')}` : '1px solid transparent',
                    background: isActive ? nc.bg || 'rgba(255,255,255,0.06)' : 'transparent',
                    cursor: 'pointer', transition: 'all 0.15s',
                  }}
                  onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.04)' }}
                  onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                    <span style={{ width: 5, height: 5, borderRadius: '50%', background: nc.dot, flexShrink: 0, opacity: 0.8 }} />
                    <span style={{
                      color: isActive ? '#fff' : 'rgba(255,255,255,0.55)',
                      fontSize: 11, fontWeight: isActive ? 600 : 400,
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    }}>
                      {n.title || 'Untitled'}
                    </span>
                  </div>
                  <div style={{
                    color: 'rgba(255,255,255,0.25)', fontSize: 10,
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    paddingLeft: 11,
                  }}>
                    {n.content ? n.content.slice(0, 28) : 'Empty'}
                  </div>
                </button>
              )
            })}
          </div>

          {/* Editor pane */}
          <div style={{
            flex: 1, display: 'flex', flexDirection: 'column',
            overflow: 'hidden', minHeight: 0,
            background: activeNote ? activeColor.bg : 'transparent',
            transition: 'background 0.3s',
          }}>
            {activeNote && (
              <>
                <input
                  ref={titleRef}
                  data-no-drag
                  value={activeNote.title}
                  onChange={e => updateNote(activeNote.id, { title: e.target.value })}
                  placeholder="Title"
                  style={{
                    flexShrink: 0, background: 'transparent', border: 'none', outline: 'none',
                    color: '#fff', fontSize: 15, fontWeight: 700,
                    padding: '16px 16px 6px', fontFamily: 'inherit', width: '100%',
                    letterSpacing: '-0.02em',
                  }}
                />
                <div style={{ height: 1, margin: '0 16px', background: 'rgba(255,255,255,0.06)', flexShrink: 0 }} />
                <textarea
                  data-no-drag
                  value={activeNote.content}
                  onChange={e => updateNote(activeNote.id, { content: e.target.value })}
                  placeholder="Start writing…"
                  className="chat-scroll"
                  style={{
                    flex: 1, background: 'transparent', border: 'none', outline: 'none', resize: 'none',
                    color: 'rgba(255,255,255,0.7)', fontSize: 12, lineHeight: 1.8,
                    padding: '10px 16px 8px', fontFamily: 'inherit', overflowY: 'auto',
                  }}
                />
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '6px 16px 10px', flexShrink: 0,
                }}>
                  <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.18)' }}>
                    {wordCount} {wordCount === 1 ? 'word' : 'words'}
                  </span>
                  <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.18)' }}>
                    {timeAgo(activeNote.updatedAt)}
                  </span>
                </div>
              </>
            )}
          </div>
        </div>

        {/* ── Bottom resize handle ── */}
        <div
          data-no-drag
          onMouseDown={onBottomDragDown}
          onDoubleClick={() => { setHeightAnimating(true); setHeight(300) }}
          onMouseEnter={e => { const pill = e.currentTarget.querySelector('div') as HTMLDivElement; if (pill) pill.style.background = 'rgba(255,255,255,0.28)' }}
          onMouseLeave={e => { const pill = e.currentTarget.querySelector('div') as HTMLDivElement; if (pill) pill.style.background = 'rgba(255,255,255,0.1)' }}
          style={{
            height: 16, flexShrink: 0, cursor: 'ns-resize',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'transparent',
          }}
        >
          <div style={{
            width: 32, height: 2, borderRadius: 99,
            background: 'rgba(255,255,255,0.1)',
            transition: 'background 0.15s',
            pointerEvents: 'none',
          }} />
        </div>
      </div>
    </div>
  )
}
