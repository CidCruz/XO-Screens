import { useState, useRef, useCallback } from 'react'
import type { Note, CaptionHistoryEntry } from '../types'
import type { CaptionTone, CaptionResults } from '../gemini'
import { processVideoFile, processVideoURL } from '../gemini'
import { loadCaptionHistory, addCaptionHistoryEntry, deleteCaptionHistoryEntry, clearCaptionHistory } from '../captionHistory'

// ─── Constants ──────────────────────────────────────────────────────────────

const STORAGE_KEY = 'xo-notes'

// SVG icons for each tone (replaces emoji)
const TONE_ICONS: Record<string, React.ReactElement> = {
  formal: (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      {/* Briefcase / formal document */}
      <rect x="2" y="7" width="20" height="14" rx="2" />
      <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" />
      <line x1="12" y1="12" x2="12" y2="16" />
      <line x1="10" y1="14" x2="14" y2="14" />
    </svg>
  ),
  sarcastic: (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      {/* Eye roll / sarcastic face */}
      <circle cx="12" cy="12" r="10" />
      <path d="M8 15s1.5 2 4 2 4-2 4-2" />
      <circle cx="9" cy="10" r="1" fill="currentColor" />
      <circle cx="15" cy="10" r="1" fill="currentColor" />
      <path d="M8 8.5c.5-1 1.5-1.5 2.5-1" strokeWidth={1.5} />
      <path d="M16 8.5c-.5-1-1.5-1.5-2.5-1" strokeWidth={1.5} />
    </svg>
  ),
  'humorous-tech': (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      {/* Code / tech brackets */}
      <polyline points="16 18 22 12 16 6" />
      <polyline points="8 6 2 12 8 18" />
      <line x1="12" y1="4" x2="12" y2="20" opacity={0.4} strokeWidth={1.5} />
    </svg>
  ),
  'humorous-nontech': (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      {/* Laugh / party */}
      <circle cx="12" cy="12" r="10" />
      <path d="M8 13s1.5 3 4 3 4-3 4-3" />
      <line x1="9" y1="9" x2="9.01" y2="9" strokeWidth={3} strokeLinecap="round" />
      <line x1="15" y1="9" x2="15.01" y2="9" strokeWidth={3} strokeLinecap="round" />
    </svg>
  ),
}

const TONES: { id: CaptionTone; label: string; color: string; dotColor: string }[] = [
  { id: 'formal',          label: 'Formal',           color: 'rgba(59,130,246,0.14)',  dotColor: 'rgba(59,130,246,0.9)'  },
  { id: 'sarcastic',       label: 'Sarcastic',        color: 'rgba(239,68,68,0.14)',   dotColor: 'rgba(239,68,68,0.9)'   },
  { id: 'humorous-tech',   label: 'Humorous Tech',    color: 'rgba(139,92,246,0.14)',  dotColor: 'rgba(139,92,246,0.9)'  },
  { id: 'humorous-nontech',label: 'Humorous Non-Tech',color: 'rgba(245,158,11,0.14)',  dotColor: 'rgba(245,158,11,0.9)'  },
]

const TONE_NOTE_COLORS: Record<CaptionTone, string> = {
  formal:              'rgba(59,130,246,0.14)',
  sarcastic:           'rgba(239,68,68,0.14)',
  'humorous-tech':     'rgba(139,92,246,0.14)',
  'humorous-nontech':  'rgba(245,158,11,0.14)',
}

const corners = [
  { top: -6,    left: -6,   dx: -1, dy: -1, rotate: 'rotate(180deg)', cursor: 'nwse-resize' },
  { top: -6,    right: -6,  dx:  1, dy: -1, rotate: 'rotate(270deg)', cursor: 'nesw-resize' },
  { bottom: -6, left: -6,   dx: -1, dy:  1, rotate: 'rotate(90deg)',  cursor: 'nesw-resize' },
  { bottom: -6, right: -6,  dx:  1, dy:  1, rotate: 'rotate(0deg)',   cursor: 'nwse-resize' },
]

// ─── Helpers ─────────────────────────────────────────────────────────────────

function loadNotes(): Note[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

function saveNotes(notes: Note[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(notes))
}

function makeNote(title: string, content: string, color: string): Note {
  const now = Date.now()
  return { id: now.toString() + Math.random().toString(36).slice(2), title, content, color, createdAt: now, updatedAt: now }
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  onClose: () => void
  onCornerDown: (e: React.MouseEvent, dx: number, dy: number) => void
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Spinner() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
      style={{ animation: 'vc-spin 0.8s linear infinite', flexShrink: 0 }}>
      <path strokeLinecap="round" d="M12 2a10 10 0 0 1 10 10" opacity={0.9} />
      <path strokeLinecap="round" d="M12 2a10 10 0 0 0-10 10" opacity={0.3} />
    </svg>
  )
}

function TonePill({ tone, active, onClick }: { tone: typeof TONES[0]; active: boolean; onClick: () => void }) {
  return (
    <button
      data-no-drag
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 5,
        padding: '5px 11px', borderRadius: 99, border: 'none', cursor: 'pointer',
        fontSize: 11, fontWeight: active ? 600 : 400, fontFamily: 'inherit',
        background: active ? tone.color : 'rgba(255,255,255,0.05)',
        color: active ? '#fff' : 'rgba(255,255,255,0.45)',
        boxShadow: active ? `0 0 0 1px ${tone.dotColor.replace('0.9', '0.4')}` : 'none',
        transition: 'all 0.15s', flexShrink: 0,
      }}
    >
      {TONE_ICONS[tone.id]}
      {tone.label}
    </button>
  )
}

// ─── History panel sub-component ──────────────────────────────────────────────

function HistoryPanel({
  entries,
  onLoad,
  onDelete,
  onClear,
  onClose,
}: {
  entries: CaptionHistoryEntry[]
  onLoad: (entry: CaptionHistoryEntry) => void
  onDelete: (id: string) => void
  onClear: () => void
  onClose: () => void
}) {
  return (
    <div style={{
      position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(10,10,12,0.97)',
      borderRadius: 22,
      display: 'flex', flexDirection: 'column',
      zIndex: 20,
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '12px 14px',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        flexShrink: 0,
      }}>
        <svg width="13" height="13" fill="none" stroke="rgba(255,255,255,0.5)" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="10" strokeWidth={1.8} />
          <polyline points="12 6 12 12 16 14" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span style={{ color: '#fff', fontWeight: 700, fontSize: 12, letterSpacing: '-0.02em' }}>Caption History</span>
        <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 11 }}>({entries.length})</span>
        <div style={{ flex: 1 }} />
        {entries.length > 0 && (
          <button data-no-drag onClick={onClear}
            style={{
              padding: '3px 10px', borderRadius: 7, border: '1px solid rgba(239,68,68,0.25)',
              background: 'rgba(239,68,68,0.08)', color: 'rgba(239,68,68,0.7)',
              fontSize: 10, fontWeight: 500, fontFamily: 'inherit', cursor: 'pointer',
              transition: 'all 0.15s',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(239,68,68,0.18)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(239,68,68,0.08)' }}
          >
            Clear all
          </button>
        )}
        <button data-no-drag onClick={onClose}
          style={{
            width: 26, height: 26, borderRadius: 8, border: 'none', background: 'transparent',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'rgba(255,255,255,0.25)', cursor: 'pointer', transition: 'all 0.15s', flexShrink: 0,
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = '#fff'; (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.08)' }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.25)'; (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
        >
          <svg width="12" height="12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* List */}
      <div className="vc-scroll" style={{ flex: 1, overflowY: 'auto', padding: '10px 12px 12px' }}>
        {entries.length === 0 ? (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            height: '100%', gap: 10, color: 'rgba(255,255,255,0.2)', paddingTop: 40,
          }}>
            <svg width="32" height="32" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.2}>
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span style={{ fontSize: 12 }}>No history yet</span>
            <span style={{ fontSize: 11, textAlign: 'center', maxWidth: 200, lineHeight: 1.5 }}>
              Generated captions will appear here for quick access
            </span>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {entries.map(entry => {
              const date = new Date(entry.createdAt)
              const dateStr = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
              const timeStr = date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
              const toneCount = Object.keys(entry.results).length
              return (
                <div key={entry.id} style={{
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.07)',
                  borderRadius: 12, padding: '10px 12px',
                  display: 'flex', alignItems: 'flex-start', gap: 10,
                  transition: 'background 0.15s',
                }}
                  onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = 'rgba(255,255,255,0.07)' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = 'rgba(255,255,255,0.04)' }}
                >
                  {/* Video icon */}
                  <div style={{
                    width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                    background: 'rgba(139,92,246,0.15)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    border: '1px solid rgba(139,92,246,0.2)',
                  }}>
                    <svg width="14" height="14" fill="none" stroke="rgba(139,92,246,0.9)" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
                        d="M15 10l4.553-2.276A1 1 0 0121 8.723v6.554a1 1 0 01-1.447.894L15 14M4 8a2 2 0 012-2h9a2 2 0 012 2v8a2 2 0 01-2 2H6a2 2 0 01-2-2V8z" />
                    </svg>
                  </div>

                  {/* Label + meta */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      color: '#fff', fontSize: 11, fontWeight: 600,
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    }} title={entry.label}>
                      {entry.label}
                    </div>
                    <div style={{ display: 'flex', gap: 8, marginTop: 4, alignItems: 'center', flexWrap: 'wrap' }}>
                      <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 10 }}>{dateStr} · {timeStr}</span>
                      <span style={{
                        color: 'rgba(139,92,246,0.8)', fontSize: 10, fontWeight: 500,
                        background: 'rgba(139,92,246,0.1)', borderRadius: 4, padding: '1px 5px',
                      }}>
                        {toneCount} tone{toneCount !== 1 ? 's' : ''}
                      </span>
                    </div>
                    {/* Tone dots */}
                    <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
                      {TONES.filter(t => entry.results[t.id]).map(t => (
                        <div key={t.id} title={t.label} style={{
                          width: 6, height: 6, borderRadius: 99,
                          background: t.dotColor,
                          opacity: 0.8,
                        }} />
                      ))}
                    </div>
                  </div>

                  {/* Actions */}
                  <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                    <button data-no-drag onClick={() => onLoad(entry)}
                      title="Load this result"
                      style={{
                        padding: '5px 10px', borderRadius: 7, border: 'none',
                        background: 'rgba(139,92,246,0.2)', color: 'rgba(139,92,246,0.9)',
                        fontSize: 10, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer',
                        transition: 'all 0.15s',
                      }}
                      onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(139,92,246,0.35)' }}
                      onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(139,92,246,0.2)' }}
                    >
                      Load
                    </button>
                    <button data-no-drag onClick={() => onDelete(entry.id)}
                      title="Delete"
                      style={{
                        width: 26, height: 26, borderRadius: 7, border: 'none',
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
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function VideoCaptionsApp({ onClose: _onClose, onCornerDown }: Props) {
  // Input state
  const [inputMode, setInputMode] = useState<'file' | 'url'>('file')
  const [videoFile, setVideoFile] = useState<File | null>(null)
  const [videoURL, setVideoURL] = useState('')
  const [dragOver, setDragOver] = useState(false)

  // Processing state
  const [status, setStatus] = useState<'idle' | 'processing' | 'done' | 'error'>('idle')
  const [processingTone, setProcessingTone] = useState<CaptionTone | null>(null)
  const [uploadPhase, setUploadPhase] = useState<'uploading' | 'processing' | null>(null)
  const [uploadPct, setUploadPct] = useState<number>(0)
  const [errorMsg, setErrorMsg] = useState('')
  const [results, setResults] = useState<CaptionResults | null>(null)

  // View state
  const [activeTone, setActiveTone] = useState<CaptionTone>('formal')
  const [activeTab, setActiveTab] = useState<'captions' | 'summary'>('summary')
  const [savedToNotes, setSavedToNotes] = useState(false)
  const [closestCorner, setClosestCorner] = useState<number | null>(null)

  // History state
  const [history, setHistory] = useState<CaptionHistoryEntry[]>(() => loadCaptionHistory())
  const [showHistory, setShowHistory] = useState(false)
  const [currentLabel, setCurrentLabel] = useState('')

  const containerRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // ── File handling ────────────────────────────────────────────────────────

  const handleFile = useCallback((file: File) => {
    if (!file.type.startsWith('video/')) {
      setErrorMsg('Please upload a video file (mp4, webm, mov, etc.)')
      setStatus('error')
      return
    }
    setVideoFile(file)
    setStatus('idle')
    setErrorMsg('')
    setResults(null)
    setSavedToNotes(false)
  }, [])

  function onFileInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (f) handleFile(f)
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    const f = e.dataTransfer.files?.[0]
    if (f) handleFile(f)
  }

  // ── Process ──────────────────────────────────────────────────────────────

  async function handleProcess() {
    setStatus('processing')
    setResults(null)
    setErrorMsg('')
    setSavedToNotes(false)
    setUploadPhase(null)
    setUploadPct(0)
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
      } else {
        throw new Error('No video source provided.')
      }
      setResults(res)
      setStatus('done')
      setProcessingTone(null)
      setUploadPhase(null)
      setCurrentLabel(label)
      const updated = addCaptionHistoryEntry({ label, results: res })
      setHistory(updated)
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Something went wrong.')
      setStatus('error')
      setProcessingTone(null)
      setUploadPhase(null)
    }
  }

  // ── Load from history ────────────────────────────────────────────────────

  function handleLoadFromHistory(entry: CaptionHistoryEntry) {
    setResults(entry.results as CaptionResults)
    setCurrentLabel(entry.label)
    setStatus('done')
    setActiveTone('formal')
    setActiveTab('summary')
    setSavedToNotes(false)
    setShowHistory(false)
  }

  // ── Delete history entry ─────────────────────────────────────────────────

  function handleDeleteHistory(id: string) {
    setHistory(deleteCaptionHistoryEntry(id))
  }

  // ── Clear all history ────────────────────────────────────────────────────

  function handleClearHistory() {
    clearCaptionHistory()
    setHistory([])
  }

  // ── Save to Notes ────────────────────────────────────────────────────────

  function saveAllToNotes() {
    if (!results) return
    const existing = loadNotes()
    const videoLabel = currentLabel || (videoFile ? videoFile.name : videoURL.trim())
    const timestamp = new Date().toLocaleString()

    const newNotes: Note[] = TONES.map(t => {
      const r = results[t.id]
      const content =
        `[Video] ${videoLabel}\n[Generated] ${timestamp}\n\n` +
        `-- Summary --\n${r.summary}\n\n` +
        `-- Captions --\n${r.captions || '(No timestamped captions generated)'}`
      return makeNote(`[${t.label}] ${videoLabel}`, content, TONE_NOTE_COLORS[t.id])
    })

    // Prepend new notes so they appear at the top of the Notes sidebar
    saveNotes([...newNotes, ...existing])
    // Notify NotesApp (and any other listener in the same window) that notes changed
    window.dispatchEvent(new CustomEvent('xo-notes-updated'))
    setSavedToNotes(true)
  }

  // ── Corner-resize tracking ───────────────────────────────────────────────

  function onMouseMove(e: React.MouseEvent) {
    if (!containerRef.current) return
    const r = containerRef.current.getBoundingClientRect()
    const x = e.clientX - r.left, y = e.clientY - r.top
    const pts = [{ cx: 0, cy: 0 }, { cx: r.width, cy: 0 }, { cx: 0, cy: r.height }, { cx: r.width, cy: r.height }]
    let closest = -1, minDist = 14
    pts.forEach((p, i) => { const d = Math.hypot(x - p.cx, y - p.cy); if (d < minDist) { minDist = d; closest = i } })
    setClosestCorner(closest)
  }

  // ── Derived ──────────────────────────────────────────────────────────────

  const canProcess =
    status !== 'processing' &&
    (inputMode === 'file' ? !!videoFile : videoURL.trim().length > 5)

  const activeToneData = TONES.find(t => t.id === activeTone)!
  const activeResult   = results?.[activeTone]

  const processingLabel = processingTone
    ? `Processing "${TONES.find(t => t.id === processingTone)?.label}" tone…`
    : 'Processing…'

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div
      ref={containerRef}
      style={{ position: 'relative', overflow: 'visible' }}
      onMouseMove={onMouseMove}
      onMouseLeave={() => setClosestCorner(null)}
    >
      {/* CSS for spinner animation — injected once */}
      <style>{`
        @keyframes vc-spin { to { transform: rotate(360deg); } }
        .vc-scroll::-webkit-scrollbar { width: 4px; }
        .vc-scroll::-webkit-scrollbar-track { background: transparent; }
        .vc-scroll::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.12); border-radius: 99px; }
      `}</style>

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

      {/* Main panel */}
      <div style={{
        width: 520, display: 'flex', flexDirection: 'column',
        background: 'rgba(10,10,12,0.82)',
        backdropFilter: 'blur(32px) saturate(180%)',
        WebkitBackdropFilter: 'blur(32px) saturate(180%)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 22,
        overflow: 'hidden',
        boxShadow: '0 32px 80px rgba(0,0,0,0.6), 0 0 0 0.5px rgba(255,255,255,0.05) inset',
        minHeight: 320,
      }}>

        {/* ── Top bar ── */}
        <div data-reset-widget style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '12px 14px',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          flexShrink: 0,
        }}>
          <span style={{ color: '#fff', fontWeight: 900, fontSize: 13, letterSpacing: '-0.03em', textShadow: '0 0 10px rgba(255,255,255,0.8)', flexShrink: 0 }}>XO</span>
          <span style={{ color: 'rgba(255,255,255,0.18)', fontSize: 11, flexShrink: 0 }}>Video Captions</span>
          <div style={{ flex: 1 }} />
          {/* History button */}
          <button data-no-drag onClick={() => setShowHistory(true)}
            title={`History (${history.length})`}
            style={{
              padding: '3px 10px', borderRadius: 7, border: 'none', cursor: 'pointer',
              fontSize: 10, fontWeight: 500, fontFamily: 'inherit',
              display: 'flex', alignItems: 'center', gap: 4,
              background: 'rgba(255,255,255,0.05)',
              color: history.length > 0 ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.2)',
              transition: 'all 0.15s',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.1)'; (e.currentTarget as HTMLButtonElement).style.color = '#fff' }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.05)'; (e.currentTarget as HTMLButtonElement).style.color = history.length > 0 ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.2)' }}
          >
            <svg width="10" height="10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="10" strokeWidth={2} />
              <polyline points="12 6 12 12 16 14" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            History{history.length > 0 ? ` (${history.length})` : ''}
          </button>
          {/* Input mode toggle */}
          <div style={{ display: 'flex', gap: 3, background: 'rgba(255,255,255,0.05)', borderRadius: 10, padding: 3 }}>
            {(['file', 'url'] as const).map(mode => (
              <button key={mode} data-no-drag onClick={() => { setInputMode(mode); setResults(null); setStatus('idle'); setSavedToNotes(false) }}
                style={{
                  padding: '3px 10px', borderRadius: 7, border: 'none', cursor: 'pointer',
                  fontSize: 10, fontWeight: 500, fontFamily: 'inherit',
                  display: 'flex', alignItems: 'center', gap: 4,
                  background: inputMode === mode ? 'rgba(255,255,255,0.1)' : 'transparent',
                  color: inputMode === mode ? '#fff' : 'rgba(255,255,255,0.35)',
                  transition: 'all 0.15s',
                }}
              >
                {mode === 'file' ? (
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="17 8 12 3 7 8" />
                    <line x1="12" y1="3" x2="12" y2="15" />
                  </svg>
                ) : (
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                  </svg>
                )}
                {mode === 'file' ? 'Upload' : 'URL'}
              </button>
            ))}
          </div>
        </div>

        {/* ── Input area ── */}
        <div style={{ padding: '14px 16px 0', flexShrink: 0 }}>
          {inputMode === 'file' ? (
            <div
              data-no-drag
              onClick={() => fileInputRef.current?.click()}
              onDragOver={e => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onDrop}
              style={{
                border: `1.5px dashed ${dragOver ? 'rgba(139,92,246,0.7)' : 'rgba(255,255,255,0.12)'}`,
                borderRadius: 14, padding: '18px 16px',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
                cursor: 'pointer', transition: 'all 0.15s',
                background: dragOver ? 'rgba(139,92,246,0.07)' : 'rgba(255,255,255,0.02)',
              }}
            >
              <svg width="28" height="28" fill="none" stroke="rgba(255,255,255,0.3)" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.723v6.554a1 1 0 01-1.447.894L15 14M4 8a2 2 0 012-2h9a2 2 0 012 2v8a2 2 0 01-2 2H6a2 2 0 01-2-2V8z" />
              </svg>
              {videoFile ? (
                <div style={{ textAlign: 'center' }}>
                  <div style={{ color: '#fff', fontSize: 12, fontWeight: 600 }}>{videoFile.name}</div>
                  <div style={{ color: 'rgba(255,255,255,0.35)', fontSize: 10, marginTop: 2 }}>
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
                  <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12, fontWeight: 500 }}>Drop a video or click to upload</div>
                  {/* File type badges */}
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', justifyContent: 'center', marginTop: 2 }}>
                    {['MP4', 'WEBM', 'MOV', 'AVI', 'MKV'].map(ext => (
                      <span key={ext} style={{
                        fontSize: 9, fontWeight: 700, letterSpacing: '0.06em',
                        padding: '2px 6px', borderRadius: 5,
                        background: 'rgba(255,255,255,0.07)',
                        border: '1px solid rgba(255,255,255,0.1)',
                        color: 'rgba(255,255,255,0.4)',
                      }}>{ext}</span>
                    ))}
                  </div>
                  {/* Max size indicator */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 2 }}>
                    <span style={{
                      fontSize: 9, fontWeight: 700, letterSpacing: '0.05em',
                      padding: '2px 7px', borderRadius: 5,
                      background: 'rgba(52,211,153,0.1)',
                      border: '1px solid rgba(52,211,153,0.2)',
                      color: 'rgba(52,211,153,0.75)',
                    }}>≤ 75 MB</span>
                    <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.2)' }}>Inline · Fast</span>
                    <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.15)' }}>·</span>
                    <span style={{
                      fontSize: 9, fontWeight: 700, letterSpacing: '0.05em',
                      padding: '2px 7px', borderRadius: 5,
                      background: 'rgba(245,158,11,0.1)',
                      border: '1px solid rgba(245,158,11,0.2)',
                      color: 'rgba(245,158,11,0.75)',
                    }}>Up to 2 GB</span>
                    <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.2)' }}>Files API · Moderate</span>
                  </div>
                </>
              )}
              <input ref={fileInputRef} type="file" accept="video/*" onChange={onFileInputChange} style={{ display: 'none' }} />
            </div>
          ) : (
            <input
              data-no-drag
              type="url"
              value={videoURL}
              onChange={e => { setVideoURL(e.target.value); setResults(null); setStatus('idle'); setSavedToNotes(false) }}
              placeholder="https://example.com/video.mp4"
              style={{
                width: '100%', boxSizing: 'border-box',
                background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 12, padding: '11px 14px', color: '#fff', fontSize: 12,
                fontFamily: 'inherit', outline: 'none', transition: 'border 0.15s',
              }}
              onFocus={e => { e.currentTarget.style.borderColor = 'rgba(139,92,246,0.5)' }}
              onBlur={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)' }}
            />
          )}
        </div>

        {/* ── Process button + status ── */}
        <div style={{ padding: '12px 16px 0', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            data-no-drag
            onClick={handleProcess}
            disabled={!canProcess}
            style={{
              flex: 1, padding: '9px 16px', borderRadius: 12, border: 'none',
              background: canProcess ? 'rgba(139,92,246,0.75)' : 'rgba(255,255,255,0.07)',
              color: canProcess ? '#fff' : 'rgba(255,255,255,0.3)',
              fontSize: 12, fontWeight: 600, fontFamily: 'inherit', cursor: canProcess ? 'pointer' : 'not-allowed',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
              transition: 'all 0.15s',
              boxShadow: canProcess ? '0 0 20px rgba(139,92,246,0.25)' : 'none',
            }}
            onMouseEnter={e => { if (canProcess) (e.currentTarget as HTMLButtonElement).style.background = 'rgba(139,92,246,0.9)' }}
            onMouseLeave={e => { if (canProcess) (e.currentTarget as HTMLButtonElement).style.background = 'rgba(139,92,246,0.75)' }}
          >
            {status === 'processing' ? <><Spinner /> {processingLabel}</> : (
              <>
                <svg width="13" height="13" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                {status === 'done' ? 'Re-process' : 'Generate Captions & Summary'}
              </>
            )}
          </button>

          {status === 'done' && !savedToNotes && (
            <button
              data-no-drag
              onClick={saveAllToNotes}
              title="Save all tones to Notes"
              style={{
                padding: '9px 14px', borderRadius: 12, border: '1px solid rgba(16,185,129,0.35)',
                background: 'rgba(16,185,129,0.12)', color: 'rgba(16,185,129,0.9)',
                fontSize: 11, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 6,
                transition: 'all 0.15s', flexShrink: 0,
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(16,185,129,0.22)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(16,185,129,0.12)' }}
            >
              <svg width="13" height="13" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
              Save to Notes
            </button>
          )}
          {savedToNotes && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, color: 'rgba(16,185,129,0.8)', fontSize: 11, flexShrink: 0 }}>
              <svg width="13" height="13" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
              Saved!
            </div>
          )}
        </div>

        {/* ── Error message ── */}
        {status === 'error' && (
          <div style={{
            margin: '10px 16px 0', padding: '10px 14px', borderRadius: 12,
            background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)',
            color: 'rgba(239,68,68,0.9)', fontSize: 11, lineHeight: 1.5, flexShrink: 0,
            display: 'flex', alignItems: 'flex-start', gap: 7,
          }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }}>
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" strokeWidth={2.5} />
            </svg>
            {errorMsg}
          </div>
        )}

        {/* ── Processing progress indicator ── */}
        {status === 'processing' && (
          <div style={{ margin: '10px 16px 0', flexShrink: 0 }}>

            {/* Upload progress — shown only when using Files API for large videos */}
            {uploadPhase && (
              <div style={{
                marginBottom: 8, padding: '8px 12px', borderRadius: 10,
                background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)',
                display: 'flex', flexDirection: 'column', gap: 5,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <Spinner />
                  <span style={{ fontSize: 11, color: 'rgba(245,158,11,0.9)', fontWeight: 500 }}>
                    {uploadPhase === 'uploading'
                      ? `Uploading to Files API… ${uploadPct}%`
                      : 'Gemini is processing your video…'}
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

            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {TONES.map(t => {
                const toneIndex = TONES.findIndex(x => x.id === processingTone)
                const thisIndex = TONES.findIndex(x => x.id === t.id)
                const isDone = toneIndex > thisIndex
                const isCurrent = t.id === processingTone
                return (
                  <div key={t.id} style={{
                    display: 'flex', alignItems: 'center', gap: 5,
                    padding: '4px 10px', borderRadius: 99, fontSize: 10,
                    background: isCurrent ? t.color : isDone ? 'rgba(16,185,129,0.1)' : 'rgba(255,255,255,0.04)',
                    color: isCurrent ? '#fff' : isDone ? 'rgba(16,185,129,0.8)' : 'rgba(255,255,255,0.3)',
                    border: `1px solid ${isCurrent ? t.dotColor.replace('0.9','0.4') : isDone ? 'rgba(16,185,129,0.25)' : 'rgba(255,255,255,0.07)'}`,
                    transition: 'all 0.2s',
                  }}>
                    {isDone ? (
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    ) : isCurrent ? <Spinner /> : (
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                        <circle cx="12" cy="12" r="9" opacity={0.3} />
                      </svg>
                    )}
                    {t.label}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* ── Results panel ── */}
        {status === 'done' && results && (
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden' }}>

            {/* Divider */}
            <div style={{ height: 1, margin: '12px 16px 0', background: 'rgba(255,255,255,0.06)', flexShrink: 0 }} />

            {/* Tone pill selector */}
            <div style={{
              display: 'flex', gap: 6, padding: '10px 16px',
              flexShrink: 0, flexWrap: 'wrap',
            }}>
              {TONES.map(t => (
                <TonePill key={t.id} tone={t} active={activeTone === t.id} onClick={() => setActiveTone(t.id)} />
              ))}
            </div>

            {/* Captions / Summary tab bar */}
            <div style={{
              display: 'flex', gap: 2, padding: '0 16px 10px',
              flexShrink: 0,
            }}>
              {(['summary', 'captions'] as const).map(tab => (
                <button key={tab} data-no-drag onClick={() => setActiveTab(tab)}
                  style={{
                    padding: '5px 14px', borderRadius: 8, border: 'none', cursor: 'pointer',
                    fontSize: 11, fontWeight: activeTab === tab ? 600 : 400, fontFamily: 'inherit',
                    background: activeTab === tab ? 'rgba(255,255,255,0.1)' : 'transparent',
                    color: activeTab === tab ? '#fff' : 'rgba(255,255,255,0.35)',
                    transition: 'all 0.15s',
                  }}
                >{tab.charAt(0).toUpperCase() + tab.slice(1)}</button>
              ))}
            </div>

            {/* Content area */}
            <div
              className="vc-scroll"
              style={{
                flex: 1, overflowY: 'auto', padding: '0 16px 16px',
                minHeight: 0, maxHeight: 260,
              }}
            >
              {activeTab === 'summary' ? (
                <div style={{
                  background: activeToneData.color,
                  border: `1px solid ${activeToneData.dotColor.replace('0.9', '0.2')}`,
                  borderRadius: 14, padding: '14px 16px',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 10 }}>
                    <span style={{ color: activeToneData.dotColor, display: 'flex', alignItems: 'center' }}>{TONE_ICONS[activeToneData.id]}</span>
                    <span style={{ color: '#fff', fontWeight: 600, fontSize: 12 }}>{activeToneData.label} Summary</span>
                  </div>
                  <p style={{
                    color: 'rgba(255,255,255,0.78)', fontSize: 12, lineHeight: 1.75,
                    margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                  }}>
                    {activeResult?.summary || 'No summary generated.'}
                  </p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                  {(activeResult?.captions || '').split('\n').filter(Boolean).map((line, i) => {
                    // Lines are expected as "0:00 – text"
                    const match = line.match(/^(\d+:\d+(?:\.\d+)?(?:\s*[–\-]\s*|\s+))(.+)$/)
                    const timestamp = match ? match[1].trim() : null
                    const text      = match ? match[2] : line
                    return (
                      <div key={i} style={{
                        display: 'flex', gap: 10, padding: '7px 0',
                        borderBottom: i < (activeResult?.captions || '').split('\n').filter(Boolean).length - 1
                          ? '1px solid rgba(255,255,255,0.05)' : 'none',
                        alignItems: 'flex-start',
                      }}>
                        {timestamp && (
                          <span style={{
                            color: activeToneData.dotColor, fontSize: 10, fontWeight: 600,
                            fontFamily: 'monospace', flexShrink: 0, paddingTop: 1,
                            minWidth: 38,
                          }}>{timestamp.replace(/[–\-]/, '').trim()}</span>
                        )}
                        <span style={{ color: 'rgba(255,255,255,0.72)', fontSize: 12, lineHeight: 1.6 }}>{text}</span>
                      </div>
                    )
                  })}
                  {!activeResult?.captions && (
                    <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 12, padding: '12px 0' }}>
                      No timestamped captions were generated.
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Bottom padding when idle */}
        {status !== 'done' && <div style={{ height: 14, flexShrink: 0 }} />}

        {/* ── History overlay ── */}
        {showHistory && (
          <HistoryPanel
            entries={history}
            onLoad={handleLoadFromHistory}
            onDelete={handleDeleteHistory}
            onClear={handleClearHistory}
            onClose={() => setShowHistory(false)}
          />
        )}

      </div>{/* end main panel */}
    </div>
  )
}
