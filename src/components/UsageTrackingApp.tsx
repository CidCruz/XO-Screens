import { useState, useEffect, useMemo, useRef } from 'react'
import type { UsageStats, DailyStat } from '../usageTracking'
import {
  loadUsageStats, calculateAverages, getMostUsedFeature,
  formatDuration, exportUsageData, clearUsageData,
} from '../usageTracking'

const corners = [
  { top: -6,    left: -6,   dx: -1, dy: -1, rotate: 'rotate(180deg)', cursor: 'nwse-resize' },
  { top: -6,    right: -6,  dx:  1, dy: -1, rotate: 'rotate(270deg)', cursor: 'nesw-resize' },
  { bottom: -6, left: -6,   dx: -1, dy:  1, rotate: 'rotate(90deg)',  cursor: 'nesw-resize' },
  { bottom: -6, right: -6,  dx:  1, dy:  1, rotate: 'rotate(0deg)',   cursor: 'nwse-resize' },
]

function ActivityChart({ dailyStats }: { dailyStats: DailyStat[] }) {
  const last14: DailyStat[] = []
  for (let i = 13; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
    last14.push(dailyStats.find(s => s.date === key) ?? { date: key, messages: 0, notes: 0, captions: 0, timeSpent: 0 })
  }
  const maxVal = Math.max(...last14.map(s => s.messages + s.notes + s.captions), 1)

  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: '100%' }}>
      {last14.map((stat, i) => {
        const total = stat.messages + stat.notes + stat.captions
        const h = Math.max((total / maxVal) * 100, 3)
        const isToday = i === 13
        return (
          <div key={stat.date} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
            <div
              title={`${new Date(stat.date).toLocaleDateString()}: ${total}`}
              style={{
                height: `${h}%`, width: '100%', borderRadius: '3px 3px 0 0',
                background: isToday
                  ? 'linear-gradient(180deg,rgba(255,255,255,0.9),rgba(255,255,255,0.5))'
                  : total > 0 ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.05)',
                transition: 'height 0.5s cubic-bezier(0.16,1,0.3,1)',
              }}
            />
            <span style={{ fontSize: 7, color: isToday ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.2)', fontWeight: isToday ? 700 : 400 }}>
              {new Date(stat.date).toLocaleDateString('en-US',{weekday:'short'}).slice(0,1)}
            </span>
          </div>
        )
      })}
    </div>
  )
}

interface Props {
  onClose?: () => void
  onCornerDown?: (e: React.MouseEvent, dx: number, dy: number) => void
}

export default function UsageTrackingApp({ onClose, onCornerDown }: Props) {
  const [stats, setStats] = useState<UsageStats>(loadUsageStats)
  const [showExport, setShowExport] = useState(false)
  const [exportData, setExportData] = useState('')
  const [closestCorner, setClosestCorner] = useState<number | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleUpdate = () => setStats(loadUsageStats())
    window.addEventListener('xo-usage-updated', handleUpdate)
    return () => window.removeEventListener('xo-usage-updated', handleUpdate)
  }, [])

  const averages = useMemo(() => calculateAverages(stats), [stats])
  const mostUsed = useMemo(() => getMostUsedFeature(stats), [stats])
  const totalInteractions = stats.chatMessagesUser + stats.notesCreated + stats.videoCaptionsGenerated

  function handleExport() {
    setExportData(exportUsageData())
    setShowExport(true)
  }

  function handleClear() {
    if (confirm('Clear all usage data? This cannot be undone.')) {
      clearUsageData()
      setStats(loadUsageStats())
    }
  }

  const statRows = [
    { label: 'Sessions',      value: stats.totalSessions,                    color: 'rgba(255,255,255,0.85)' },
    { label: 'Time Spent',    value: formatDuration(stats.totalTimeSpent),   color: 'rgba(255,255,255,0.65)' },
    { label: 'Messages',      value: stats.chatMessagesUser,                 color: 'rgba(255,255,255,0.85)' },
    { label: 'AI Replies',    value: stats.chatMessagesAI,                   color: 'rgba(255,255,255,0.65)' },
    { label: 'Tool Calls',    value: stats.chatToolCalls,                    color: 'rgba(255,255,255,0.65)' },
    { label: 'Notes Created', value: stats.notesCreated,                     color: 'rgba(255,255,255,0.85)' },
    { label: 'Words Written', value: Math.max(stats.notesWordCount, 0),      color: 'rgba(255,255,255,0.65)' },
    { label: 'Captions',      value: stats.videoCaptionsGenerated,           color: 'rgba(255,255,255,0.85)' },
  ]

  const featureRows = [
    { key: 'chat',     label: 'Assistant', count: stats.featuresUsed.chat     },
    { key: 'notes',    label: 'Notes',     count: stats.featuresUsed.notes    },
    { key: 'video',    label: 'Video',     count: stats.featuresUsed.video    },
    { key: 'settings', label: 'Settings',  count: stats.featuresUsed.settings },
  ] as const
  const featureTotal = Math.max(featureRows.reduce((s, f) => s + f.count, 0), 1)

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
      {onCornerDown && corners.map((c, i) => (
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
        width: 480, display: 'flex', flexDirection: 'column',
        background: 'rgba(10,10,12,0.82)',
        backdropFilter: 'blur(32px) saturate(180%)',
        WebkitBackdropFilter: 'blur(32px) saturate(180%)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 22, overflow: 'hidden',
        boxShadow: '0 32px 80px rgba(0,0,0,0.6), 0 0 0 0.5px rgba(255,255,255,0.05) inset',
      }}>

        {/* ── Header ── */}
        <div data-reset-widget style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '12px 14px', borderBottom: '1px solid rgba(255,255,255,0.06)', flexShrink: 0,
        }}>
          <span style={{ color: '#fff', fontWeight: 900, fontSize: 13, letterSpacing: '-0.03em', textShadow: '0 0 10px rgba(255,255,255,0.8)', flexShrink: 0 }}>XO</span>
          <span style={{ color: 'rgba(255,255,255,0.18)', fontSize: 11 }}>Usage</span>
          <div style={{ flex: 1 }} />
          {/* Live dot */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <div style={{ width: 5, height: 5, borderRadius: '50%', background: 'rgba(255,255,255,0.5)', boxShadow: '0 0 5px rgba(255,255,255,0.4)', animation: 'pulse-glow 2s ease-in-out infinite' }} />
            <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)' }}>live</span>
          </div>
          {/* Close */}
          {onClose && <button data-no-drag onClick={onClose} title="Close"
            style={{ width: 26, height: 26, borderRadius: 8, border: 'none', background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.25)', cursor: 'pointer', transition: 'all 0.15s', flexShrink: 0 }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = '#f87171'; (e.currentTarget as HTMLButtonElement).style.background = 'rgba(239,68,68,0.12)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.25)'; (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
          >
            <svg width="12" height="12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>}
        </div>

        {/* ── Body ── */}
        <div className="chat-scroll" style={{ overflowY: 'auto', padding: '14px', display: 'flex', flexDirection: 'column', gap: 10 }}>

          {/* Row 1 — 4 big stat tiles */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8 }}>
            {[
              { label: 'Sessions',  value: stats.totalSessions,         sub: formatDuration(stats.totalTimeSpent) },
              { label: 'Messages',  value: stats.chatMessagesUser,      sub: `${stats.chatMessagesAI} AI` },
              { label: 'Notes',     value: stats.notesCreated,          sub: `${stats.notesEdited} edits` },
              { label: 'Captions',  value: stats.videoCaptionsGenerated, sub: `${stats.videoFilesProcessed} videos` },
            ].map(s => (
              <div key={s.label} style={{
                padding: '12px 12px 10px', borderRadius: 14,
                background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)',
                display: 'flex', flexDirection: 'column', gap: 2,
              }}>
                <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{s.label}</span>
                <span style={{ fontSize: 22, fontWeight: 700, color: '#fff', lineHeight: 1.1, letterSpacing: '-0.03em' }}>{s.value}</span>
                <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.25)' }}>{s.sub}</span>
              </div>
            ))}
          </div>

          {/* Row 2 — stat list + feature bars side by side */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>

            {/* Stat list */}
            <div style={{ padding: '12px 14px', borderRadius: 14, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', display: 'flex', flexDirection: 'column', gap: 7 }}>
              <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 2 }}>All Stats</span>
              {statRows.map(row => (
                <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)' }}>{row.label}</span>
                  <span style={{ fontSize: 11, color: row.color, fontWeight: 600 }}>{row.value}</span>
                </div>
              ))}
            </div>

            {/* Feature bars + averages */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ padding: '12px 14px', borderRadius: 14, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', display: 'flex', flexDirection: 'column', gap: 8 }}>
                <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Feature Usage</span>
                {featureRows.map(f => {
                  const pct = Math.round((f.count / featureTotal) * 100)
                  const isTop = mostUsed === f.key
                  return (
                    <div key={f.key}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                        <span style={{ fontSize: 10, color: isTop ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.35)', display: 'flex', alignItems: 'center', gap: 4 }}>
                          {isTop && <span style={{ width: 4, height: 4, borderRadius: '50%', background: '#fff', display: 'inline-block', flexShrink: 0 }} />}
                          {f.label}
                        </span>
                        <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', fontWeight: 600 }}>{pct}%</span>
                      </div>
                      <div style={{ height: 2, borderRadius: 99, background: 'rgba(255,255,255,0.07)', overflow: 'hidden' }}>
                        <div style={{ height: '100%', borderRadius: 99, width: `${pct}%`, background: isTop ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.2)', transition: 'width 0.6s cubic-bezier(0.16,1,0.3,1)' }} />
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Averages */}
              <div style={{ padding: '10px 14px', borderRadius: 14, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Daily Avg</span>
                {[
                  { label: 'Msgs/day',     value: averages.avgMessagesPerDay },
                  { label: 'Notes/day',    value: averages.avgNotesPerDay    },
                  { label: 'Avg session',  value: formatDuration(averages.avgTimePerSession) },
                  { label: 'Interactions', value: totalInteractions          },
                ].map(a => (
                  <div key={a.label} style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>{a.label}</span>
                    <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.65)', fontWeight: 600 }}>{a.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Row 3 — activity chart */}
          <div style={{ padding: '12px 14px', borderRadius: 14, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Activity — Last 14 Days</span>
              <div style={{ display: 'flex', gap: 10 }}>
                {[{ dot: 'rgba(255,255,255,0.8)', label: 'Today' }, { dot: 'rgba(255,255,255,0.2)', label: 'Past' }].map(l => (
                  <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <div style={{ width: 6, height: 6, borderRadius: 2, background: l.dot }} />
                    <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.25)' }}>{l.label}</span>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ height: 52 }}>
              <ActivityChart dailyStats={stats.dailyStats} />
            </div>
          </div>

          {/* Row 4 — footer: dates + actions */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            {/* Dates */}
            <div style={{ display: 'flex', gap: 16 }}>
              {[
                { label: 'First Used',  ts: stats.firstSessionDate },
                { label: 'Last Active', ts: stats.lastSessionDate  },
              ].map(d => (
                <div key={d.label} style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.2)', fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase' }}>{d.label}</span>
                  <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', fontFamily: 'monospace' }}>
                    {new Date(d.ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </span>
                </div>
              ))}
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: 6 }}>
              <button data-no-drag onClick={handleExport} style={{
                padding: '6px 12px', borderRadius: 9, border: '1px solid rgba(255,255,255,0.1)',
                background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.5)',
                fontSize: 10, fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s', fontFamily: 'inherit',
              }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.1)'; (e.currentTarget as HTMLButtonElement).style.color = '#fff' }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.05)'; (e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.5)' }}
              >Export</button>
              <button data-no-drag onClick={handleClear} style={{
                padding: '6px 12px', borderRadius: 9, border: '1px solid rgba(239,68,68,0.2)',
                background: 'rgba(239,68,68,0.06)', color: 'rgba(239,68,68,0.6)',
                fontSize: 10, fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s', fontFamily: 'inherit',
              }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(239,68,68,0.16)'; (e.currentTarget as HTMLButtonElement).style.color = '#f87171' }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(239,68,68,0.06)'; (e.currentTarget as HTMLButtonElement).style.color = 'rgba(239,68,68,0.6)' }}
              >Clear</button>
            </div>
          </div>

        </div>
      </div>

      {/* Export modal */}
      {showExport && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(12px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }} onClick={() => setShowExport(false)}>
          <div style={{
            width: 480, borderRadius: 20,
            background: 'rgba(10,10,12,0.95)', border: '1px solid rgba(255,255,255,0.08)',
            padding: '20px', boxShadow: '0 32px 80px rgba(0,0,0,0.8)',
          }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>Export Usage Data</span>
              <button onClick={() => setShowExport(false)} style={{ width: 26, height: 26, borderRadius: 8, border: 'none', background: 'transparent', color: 'rgba(255,255,255,0.3)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = '#f87171'; (e.currentTarget as HTMLButtonElement).style.background = 'rgba(239,68,68,0.1)' }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.3)'; (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
              >
                <svg width="12" height="12" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <textarea readOnly value={exportData} className="chat-scroll" style={{
              width: '100%', height: 200, borderRadius: 12,
              background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
              color: 'rgba(255,255,255,0.6)', fontFamily: 'monospace', fontSize: 10,
              padding: '10px', resize: 'none', outline: 'none', boxSizing: 'border-box',
            }} />
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <button onClick={() => navigator.clipboard.writeText(exportData)} style={{
                flex: 1, padding: '9px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.12)',
                background: 'rgba(255,255,255,0.08)', color: '#fff',
                fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s',
              }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.14)' }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.08)' }}
              >Copy to Clipboard</button>
              <button onClick={() => setShowExport(false)} style={{
                padding: '9px 16px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.08)',
                background: 'transparent', color: 'rgba(255,255,255,0.35)', fontSize: 11,
                cursor: 'pointer', fontFamily: 'inherit',
              }}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
