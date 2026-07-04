import { useState, useRef, useCallback } from 'react'
import type { Note } from '../types'
import type { CaptionTone, CaptionResults } from '../gemini'
import { processVideoFile, processVideoURL } from '../gemini'

// ─── Constants ──────────────────────────────────────────────────────────────

const STORAGE_KEY = 'xo-notes'

const TONES: { id: CaptionTone; label: string; emoji: string; color: string; dotColor: string }[] = [
  { id: 'formal',          label: 'Formal',           emoji: '🎩', color: 'rgba(59,130,246,0.14)',  dotColor: 'rgba(59,130,246,0.9)'  },
  { id: 'sarcastic',       label: 'Sarcastic',        emoji: '🙄', color: 'rgba(239,68,68,0.14)',   dotColor: 'rgba(239,68,68,0.9)'   },
  { id: 'humorous-tech',   label: 'Humorous Tech',    emoji: '🤓', color: 'rgba(139,92,246,0.14)',  dotColor: 'rgba(139,92,246,0.9)'  },
  { id: 'humorous-nontech',label: 'Humorous Non-Tech',emoji: '😂', color: 'rgba(245,158,11,0.14)',  dotColor: 'rgba(245,158,11,0.9)'  },
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
      <span style={{ fontSize: 12 }}>{tone.emoji}</span>
      {tone.label}
    </button>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function VideoCaptionsApp({ onClose, onCornerDown }: Props) {
  // Input state
  const [inputMode, setInputMode] = useState<'file' | 'url'>('file')
  const [videoFile, setVideoFile] = useState<File | null>(null)
  const [videoURL, setVideoURL] = useState('')
  const [dragOver, setDragOver] = useState(false)

  // Processing state
  const [status, setStatus] = useState<'idle' | 'processing' | 'done' | 'error'>('idle')
  const [processingTone, setProcessingTone] = useState<CaptionTone | null>(null)
  const [errorMsg, setErrorMsg] = useState('')
  const [results, setResults] = useState<CaptionResults | null>(null)

  // View state
  const [activeTone, setActiveTone] = useState<CaptionTone>('formal')
  const [activeTab, setActiveTab] = useState<'captions' | 'summary'>('summary')
  const [savedToNotes, setSavedToNotes] = useState(false)
  const [closestCorner, setClosestCorner] = useState<number | null>(null)

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
    try {
      let res: CaptionResults
      if (inputMode === 'file' && videoFile) {
        res = await processVideoFile(videoFile, t => setProcessingTone(t))
      } else if (inputMode === 'url' && videoURL.trim()) {
        res = await processVideoURL(videoURL.trim(), t => setProcessingTone(t))
      } else {
        throw new Error('No video source provided.')
      }
      setResults(res)
      setStatus('done')
      setProcessingTone(null)
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Something went wrong.')
      setStatus('error')
      setProcessingTone(null)
    }
  }

  // ── Save to Notes ────────────────────────────────────────────────────────

  function saveAllToNotes() {
    if (!results) return
    const existing = loadNotes()
    const videoLabel = videoFile ? videoFile.name : videoURL.trim()
    const timestamp = new Date().toLocaleString()

    const newNotes: Note[] = TONES.map(t => {
      const r = results[t.id]
      const content =
        `📺 Video: ${videoLabel}\n🕐 Generated: ${timestamp}\n\n` +
        `── Summary ─────────────────────────────\n${r.summary}\n\n` +
        `── Captions ────────────────────────────\n${r.captions || '(No timestamped captions generated)'}`
      return makeNote(`${t.emoji} ${t.label} — ${videoLabel}`, content, TONE_NOTE_COLORS[t.id])
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
        width: 460, display: 'flex', flexDirection: 'column',
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
          {/* Input mode toggle */}
          <div style={{ display: 'flex', gap: 3, background: 'rgba(255,255,255,0.05)', borderRadius: 10, padding: 3 }}>
            {(['file', 'url'] as const).map(mode => (
              <button key={mode} data-no-drag onClick={() => { setInputMode(mode); setResults(null); setStatus('idle'); setSavedToNotes(false) }}
                style={{
                  padding: '3px 10px', borderRadius: 7, border: 'none', cursor: 'pointer',
                  fontSize: 10, fontWeight: 500, fontFamily: 'inherit',
                  background: inputMode === mode ? 'rgba(255,255,255,0.1)' : 'transparent',
                  color: inputMode === mode ? '#fff' : 'rgba(255,255,255,0.35)',
                  transition: 'all 0.15s',
                }}
              >{mode === 'file' ? '⬆ Upload' : '🔗 URL'}</button>
            ))}
          </div>
          {/* Close */}
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
                    {(videoFile.size / (1024 * 1024)).toFixed(1)} MB — click to change
                  </div>
                </div>
              ) : (
                <>
                  <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12, fontWeight: 500 }}>Drop a video or click to upload</div>
                  <div style={{ color: 'rgba(255,255,255,0.25)', fontSize: 10 }}>mp4 · webm · mov · avi · mkv</div>
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
          }}>
            ⚠ {errorMsg}
          </div>
        )}

        {/* ── Processing progress indicator ── */}
        {status === 'processing' && (
          <div style={{ margin: '10px 16px 0', flexShrink: 0 }}>
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
                    {isDone ? '✓' : isCurrent ? <Spinner /> : <span style={{ opacity: 0.3 }}>○</span>}
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
              overflowX: 'auto', flexShrink: 0, flexWrap: 'nowrap',
            }} className="vc-scroll">
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
                    <span style={{ fontSize: 16 }}>{activeToneData.emoji}</span>
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

      </div>{/* end main panel */}
    </div>
  )
}
