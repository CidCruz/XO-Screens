import { useState, useEffect, useRef, useMemo } from 'react'
import AppHub from './components/AppHub'
import ChatBox from './components/ChatBox'
import NotesApp from './components/NotesApp'
import VideoCaptionsApp from './components/VideoCaptionsApp'
import DraggableWidget from './components/DraggableWidget'
import type { AppItem, Note, AppControl, WidgetId } from './types'
import { xo } from './env'
import { loadCaptionHistory } from './captionHistory'

const APPS: AppItem[] = [
  { id: 'chat',     label: 'Assistant'       },
  { id: 'notes',    label: 'Notes'           },
  { id: 'video',    label: 'Video Captions'  },
  { id: 'usage',    label: 'Usage Tracking'  },
  { id: 'settings', label: 'Settings'        },
]

// ── Settings widget (overlay-native, glass style) ──────────────────────────

const settingsCorners = [
  { top: -6,    left: -6,   dx: -1, dy: -1, rotate: 'rotate(180deg)', cursor: 'nwse-resize' },
  { top: -6,    right: -6,  dx:  1, dy: -1, rotate: 'rotate(270deg)', cursor: 'nesw-resize' },
  { bottom: -6, left: -6,   dx: -1, dy:  1, rotate: 'rotate(90deg)',  cursor: 'nesw-resize' },
  { bottom: -6, right: -6,  dx:  1, dy:  1, rotate: 'rotate(0deg)',   cursor: 'nwse-resize' },
]

interface SettingsWidgetProps {
  onClose: () => void
  onCornerDown: (e: React.MouseEvent, dx: number, dy: number) => void
}

function SettingsWidget({ onClose, onCornerDown }: SettingsWidgetProps) {
  const [closestCorner, setClosestCorner] = useState<number | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const apiKey = import.meta.env.VITE_FIREWORKS_API_KEY
  const masked = apiKey ? `${apiKey.slice(0, 6)}${'•'.repeat(20)}` : 'Not set'

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
      {settingsCorners.map((c, i) => (
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

      {/* Panel */}
      <div style={{
        width: 340, display: 'flex', flexDirection: 'column',
        background: 'rgba(10,10,12,0.85)', backdropFilter: 'blur(32px) saturate(180%)',
        WebkitBackdropFilter: 'blur(32px) saturate(180%)',
        border: '1px solid rgba(255,255,255,0.08)', borderRadius: 20,
        overflow: 'hidden', boxShadow: '0 24px 60px rgba(0,0,0,0.55)',
      }}>
        {/* Header */}
        <div data-reset-widget style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '14px 16px', borderBottom: '1px solid rgba(255,255,255,0.07)', flexShrink: 0,
        }}>
          <span style={{ color: '#fff', fontWeight: 900, fontSize: 13, letterSpacing: '-0.03em', textShadow: '0 0 10px rgba(255,255,255,0.8)' }}>XO</span>
          <span style={{ color: 'rgba(255,255,255,0.18)', fontSize: 11 }}>Settings</span>
          <div style={{ flex: 1 }} />
          <button data-no-drag onClick={onClose} title="Close"
            style={{ width: 26, height: 26, borderRadius: 8, border: 'none', background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.25)', cursor: 'pointer', transition: 'all 0.15s', flexShrink: 0 }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = '#f87171'; (e.currentTarget as HTMLButtonElement).style.background = 'rgba(239,68,68,0.12)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.25)'; (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
          >
            <svg width="12" height="12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Fireworks AI section */}
          <div>
            <div style={{ fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8 }}>
              Fireworks AI
            </div>
            <div style={{ padding: '12px 14px', borderRadius: 12, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', marginBottom: 5 }}>API Key</div>
              <div style={{ fontFamily: 'monospace', fontSize: 11, color: apiKey ? 'rgba(52,211,153,0.85)' : 'rgba(239,68,68,0.8)', wordBreak: 'break-all' }}>
                {masked}
              </div>
              {!apiKey && (
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', marginTop: 8, lineHeight: 1.6 }}>
                  Set <code style={{ background: 'rgba(255,255,255,0.07)', padding: '1px 4px', borderRadius: 3 }}>VITE_FIREWORKS_API_KEY</code> in <code style={{ background: 'rgba(255,255,255,0.07)', padding: '1px 4px', borderRadius: 3 }}>.env.local</code>
                </div>
              )}
            </div>
          </div>

          {/* About section */}
          <div>
            <div style={{ fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8 }}>
              About
            </div>
            <div style={{ padding: '12px 14px', borderRadius: 12, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', display: 'flex', flexDirection: 'column', gap: 9 }}>
              {[
                { label: 'Version',   value: '0.0.0' },
                { label: 'Mode',      value: 'Desktop Overlay' },
                { label: 'Provider',  value: 'Fireworks AI' },
                { label: 'Chat',      value: 'DeepSeek V4 Pro' },
                { label: 'Captions',  value: 'Qwen3 Plus (Vision)' },
                { label: 'Platform',  value: xo.platform ?? 'electron' },
              ].map(row => (
                <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>{row.label}</span>
                  <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.65)', fontFamily: 'monospace' }}>{row.value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Shortcuts section */}
          <div>
            <div style={{ fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8 }}>
              Shortcuts
            </div>
            <div style={{ padding: '12px 14px', borderRadius: 12, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', display: 'flex', flexDirection: 'column', gap: 9 }}>
              {[
                { label: 'Toggle overlay',  value: '⌘⇧Space' },
                { label: 'Drag widget',     value: 'Header drag' },
                { label: 'Resize widget',   value: 'Corner drag' },
                { label: 'Reset size',      value: 'Corner dbl-click' },
              ].map(row => (
                <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>{row.label}</span>
                  <kbd style={{ fontSize: 10, color: 'rgba(255,255,255,0.55)', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 5, padding: '2px 7px', fontFamily: 'inherit' }}>{row.value}</kbd>
                </div>
              ))}
            </div>
          </div>

          {/* App actions */}
          <div>
            <div style={{ fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8 }}>
              App
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button data-no-drag onClick={() => xo.minimizeToTray()} style={{
                flex: 1, padding: '9px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.1)',
                background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.55)',
                fontSize: 11, fontWeight: 500, fontFamily: 'inherit', cursor: 'pointer', transition: 'all 0.15s',
              }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.1)'; (e.currentTarget as HTMLButtonElement).style.color = '#fff' }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.05)'; (e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.55)' }}
              >
                Minimize to Tray
              </button>
              <button data-no-drag onClick={() => xo.quit()} style={{
                flex: 1, padding: '9px', borderRadius: 10, border: '1px solid rgba(239,68,68,0.25)',
                background: 'rgba(239,68,68,0.08)', color: 'rgba(239,68,68,0.7)',
                fontSize: 11, fontWeight: 500, fontFamily: 'inherit', cursor: 'pointer', transition: 'all 0.15s',
              }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(239,68,68,0.18)'; (e.currentTarget as HTMLButtonElement).style.color = '#f87171' }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(239,68,68,0.08)'; (e.currentTarget as HTMLButtonElement).style.color = 'rgba(239,68,68,0.7)' }}
              >
                Quit XO Screens
              </button>
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}

// ── Notes helpers (mirrors what NotesApp uses internally) ─────────────────────

const NOTES_STORAGE_KEY = 'xo-notes'

function loadNotes(): Note[] {
  try {
    const raw = localStorage.getItem(NOTES_STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

function saveNotes(notes: Note[]) {
  localStorage.setItem(NOTES_STORAGE_KEY, JSON.stringify(notes))
  window.dispatchEvent(new CustomEvent('xo-notes-updated'))
}

function makeNewNote(title: string, content: string): Note {
  const now = Date.now()
  return {
    id: now.toString() + Math.random().toString(36).slice(2),
    title,
    content,
    color: 'rgba(255,255,255,0.0)',
    createdAt: now,
    updatedAt: now,
  }
}

// ─────────────────────────────────────────────────────────────────────────────

export default function App() {
  const [splash, setSplash] = useState(true)
  const [fadeIn, setFadeIn] = useState(false)
  const [fadeOut, setFadeOut] = useState(false)
  const [appVisible, setAppVisible] = useState(false)
  const [chatOpen, setChatOpen] = useState(true)
  const [notesOpen, setNotesOpen] = useState(true)
  const [videoOpen, setVideoOpen] = useState(true)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [activeNote, setActiveNote] = useState<Note | null>(null)
  const [windowAnim, setWindowAnim] = useState<'visible' | 'entering' | 'exiting'>('visible')
  const exitTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Refs so AppControl callbacks always see the latest state without stale closures
  const chatOpenRef     = useRef(chatOpen)
  const notesOpenRef    = useRef(notesOpen)
  const videoOpenRef    = useRef(videoOpen)
  const settingsOpenRef = useRef(settingsOpen)
  useEffect(() => { chatOpenRef.current     = chatOpen     }, [chatOpen])
  useEffect(() => { notesOpenRef.current    = notesOpen    }, [notesOpen])
  useEffect(() => { videoOpenRef.current    = videoOpen    }, [videoOpen])
  useEffect(() => { settingsOpenRef.current = settingsOpen }, [settingsOpen])

  useEffect(() => {
    const fadeInTimer = setTimeout(() => setFadeIn(true), 50)
    const fadeOutTimer = setTimeout(() => setFadeOut(true), 3500)
    const hide = setTimeout(() => setSplash(false), 4200)
    const appFadeIn = setTimeout(() => setAppVisible(true), 4250)
    return () => { clearTimeout(fadeInTimer); clearTimeout(fadeOutTimer); clearTimeout(hide); clearTimeout(appFadeIn) }
  }, [])

  // Listen for show/hide signals from main process
  useEffect(() => {
    xo.onShow(() => {
      if (exitTimer.current) clearTimeout(exitTimer.current)
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
      document.body.focus()
      setWindowAnim('entering')
      setTimeout(() => setWindowAnim('visible'), 260)
    })
    xo.onHideAnimate(() => {
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
      setWindowAnim('exiting')
      exitTimer.current = setTimeout(() => { xo.readyToHide() }, 210)
    })
  }, [])

  function handleSelect(id: string) {
    if (id === 'chat')     setChatOpen(prev => !prev)
    if (id === 'notes')    setNotesOpen(prev => !prev)
    if (id === 'video')    setVideoOpen(prev => !prev)
    if (id === 'settings') setSettingsOpen(prev => !prev)
  }

  // ── AppControl — the API the ChatBox tools call into ─────────────────────
  const appControl = useMemo<AppControl>(() => ({
    openWidget(id: WidgetId) {
      if (id === 'chat')     setChatOpen(true)
      if (id === 'notes')    setNotesOpen(true)
      if (id === 'video')    setVideoOpen(true)
      if (id === 'settings') setSettingsOpen(true)
    },
    closeWidget(id: WidgetId) {
      if (id === 'chat')     setChatOpen(false)
      if (id === 'notes')    setNotesOpen(false)
      if (id === 'video')    setVideoOpen(false)
      if (id === 'settings') setSettingsOpen(false)
    },
    getOpenWidgets(): WidgetId[] {
      const open: WidgetId[] = []
      if (chatOpenRef.current)     open.push('chat')
      if (notesOpenRef.current)    open.push('notes')
      if (videoOpenRef.current)    open.push('video')
      if (settingsOpenRef.current) open.push('settings')
      return open
    },

    // Notes CRUD — operates directly on localStorage and fires the same
    // 'xo-notes-updated' event that NotesApp already listens to.
    listNotes(): Note[] {
      return loadNotes()
    },
    getNote(id: string): Note | undefined {
      return loadNotes().find(n => n.id === id)
    },
    createNote(title: string, content: string): Note {
      const note = makeNewNote(title, content)
      saveNotes([note, ...loadNotes()])
      return note
    },
    updateNote(id: string, patch: Partial<Pick<Note, 'title' | 'content' | 'color'>>): Note | null {
      const notes = loadNotes()
      const idx = notes.findIndex(n => n.id === id)
      if (idx === -1) return null
      const updated: Note = { ...notes[idx], ...patch, updatedAt: Date.now() }
      notes[idx] = updated
      saveNotes(notes)
      return updated
    },
    deleteNote(id: string): boolean {
      const notes = loadNotes()
      const next = notes.filter(n => n.id !== id)
      if (next.length === notes.length) return false
      saveNotes(next)
      return true
    },
    focusNote(id: string): void {
      // Dispatch a custom event that NotesApp listens for to set its active note
      window.dispatchEvent(new CustomEvent('xo-focus-note', { detail: { id } }))
    },

    getCaptionHistory() {
      return loadCaptionHistory()
    },
  }), []) // stable — setters from useState never change identity

  // ── Derived ───────────────────────────────────────────────────────────────
  const openApps = new Set([
    ...(chatOpen     ? ['chat']     : []),
    ...(notesOpen    ? ['notes']    : []),
    ...(videoOpen    ? ['video']    : []),
    ...(settingsOpen ? ['settings'] : []),
  ])

  const animClass = windowAnim === 'entering' ? 'app-enter'
    : windowAnim === 'exiting' ? 'app-exit'
    : ''

  if (splash) return (
    <div style={{
      position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
      opacity: fadeOut ? 0 : fadeIn ? 1 : 0, transition: 'opacity 0.6s ease', zIndex: 9999
    }}>
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Montserrat:ital,wght@0,900&display=swap" />
      <div style={{
        padding: '20px 40px',
        border: '2px solid rgba(255,255,255,0.8)',
        borderRadius: '12px',
        boxShadow: '0 0 12px rgba(255,255,255,0.8), 0 0 30px rgba(255,255,255,0.4), inset 0 0 12px rgba(255,255,255,0.1)',
      }}>
        <h1 style={{ color: '#fff', fontSize: '5rem', fontWeight: 900, fontStyle: 'normal', fontFamily: '"Montserrat", sans-serif', letterSpacing: '0.08em', margin: 0, textShadow: '0 0 10px rgba(255,255,255,0.4), 0 0 25px rgba(255,255,255,0.2), 0 0 50px rgba(255,255,255,0.1)' }}>XO Screens.</h1>
      </div>
    </div>
  )

  return (
    <div className={`w-screen h-screen ${animClass}`} style={{ background: 'transparent', pointerEvents: 'none', opacity: appVisible ? 1 : 0, transition: appVisible ? undefined : 'opacity 0.6s ease' }}>

      <DraggableWidget initialX={20} initialY={Math.round((window.innerHeight - 300) / 2)} baseWidth={64} baseHeight={300}>
        {(onCornerDown) => <AppHub apps={APPS} openApps={openApps} onSelect={handleSelect} onCornerDown={onCornerDown} />}
      </DraggableWidget>

      {chatOpen && (
        <DraggableWidget initialX={Math.round(window.innerWidth - 320 * 1.2 - 20)} initialY={20} baseWidth={320} baseHeight={480} initialScale={1.2}>
          {(onCornerDown) => <ChatBox onClose={() => setChatOpen(false)} onCornerDown={onCornerDown} activeNote={activeNote} appControl={appControl} />}
        </DraggableWidget>
      )}

      {notesOpen && (
        <DraggableWidget initialX={Math.round(window.innerWidth - 420 - 20)} initialY={Math.min(Math.round(20 + 480 * 1.2 + 8), window.innerHeight - 300 - 20)} baseWidth={420} baseHeight={300}>
          {(onCornerDown) => <NotesApp onClose={() => setNotesOpen(false)} onCornerDown={onCornerDown} onNoteChange={setActiveNote} />}
        </DraggableWidget>
      )}

      {videoOpen && (
        <DraggableWidget initialX={Math.round(window.innerWidth - 320 * 1.2 - 20 - 12 - 520)} initialY={20} baseWidth={520} baseHeight={520}>
          {(onCornerDown) => <VideoCaptionsApp onClose={() => setVideoOpen(false)} onCornerDown={onCornerDown} />}
        </DraggableWidget>
      )}

      {settingsOpen && (
        <DraggableWidget initialX={Math.round((window.innerWidth - 340) / 2)} initialY={Math.round((window.innerHeight - 440) / 2)} baseWidth={340} baseHeight={440}>
          {(onCornerDown) => <SettingsWidget onClose={() => setSettingsOpen(false)} onCornerDown={onCornerDown} />}
        </DraggableWidget>
      )}

    </div>
  )
}
