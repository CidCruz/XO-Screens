import { useState, useEffect, useMemo } from 'react'
import type { UsageStats, DailyStat } from '../usageTracking'
import {
  loadUsageStats, calculateAverages, getMostUsedFeature,
  formatDuration, exportUsageData, clearUsageData,
} from '../usageTracking'

/* ── Refresh icon ──────────────────────────────────────────────────────────── */
function RefreshIcon({ spinning }: { spinning: boolean }) {
  return (
    <svg width="13" height="13" fill="none" stroke="currentColor" viewBox="0 0 24 24"
      style={{ transition: 'transform 0.5s', transform: spinning ? 'rotate(360deg)' : 'rotate(0deg)' }}>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
    </svg>
  )
}

/* ── Activity bar chart ────────────────────────────────────────────────────── */
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
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 5, height: '100%', minHeight: 60 }}>
      {last14.map((stat, i) => {
        const total = stat.messages + stat.notes + stat.captions
        const h = Math.max((total / maxVal) * 100, 4)
        const isToday = i === 13
        return (
          <div key={stat.date} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
            <div title={`${new Date(stat.date).toLocaleDateString()}: ${total}`} style={{
              height: `${h}%`, width: '100%', borderRadius: '4px 4px 0 0',
              background: isToday ? 'linear-gradient(180deg,#EBB159,#EE6F53)'
                : total > 0 ? 'linear-gradient(180deg,rgba(235,177,89,0.55),rgba(238,111,83,0.3))'
                : 'rgba(255,255,255,0.05)',
              boxShadow: total > 0 ? '0 0 8px rgba(235,177,89,0.25)' : 'none',
              transition: 'height 0.5s cubic-bezier(0.16,1,0.3,1)',
            }} />
            <span style={{ fontSize: 8, color: isToday ? 'rgba(235,177,89,0.85)' : 'rgba(255,255,255,0.2)', fontWeight: isToday ? 700 : 400 }}>
              {new Date(stat.date).toLocaleDateString('en-US',{weekday:'short'}).slice(0,1)}
            </span>
          </div>
        )
      })}
    </div>
  )
}

/* ── Main component ────────────────────────────────────────────────────────── */
export default function UsageTrackingApp() {
  const [stats, setStats] = useState<UsageStats>(loadUsageStats)
  const [showExport, setShowExport] = useState(false)
  const [exportData, setExportData] = useState('')
  const [spinning, setSpinning] = useState(false)

  useEffect(() => {
    const handleUpdate = () => setStats(loadUsageStats())
    window.addEventListener('xo-usage-updated', handleUpdate)
    return () => window.removeEventListener('xo-usage-updated', handleUpdate)
  }, [])

  const averages = useMemo(() => calculateAverages(stats), [stats])
  const mostUsed = useMemo(() => getMostUsedFeature(stats), [stats])
  const totalInteractions = stats.chatMessagesUser + stats.notesCreated + stats.videoCaptionsGenerated

  function handleRefresh() {
    setSpinning(true)
    setStats(loadUsageStats())
    setTimeout(() => setSpinning(false), 500)
  }

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

  return (
    <div className="xo-bento-chat" style={{ padding: 0 }}>

        {/* ═══ LEFT COLUMN ═══ */}
        <div className="xo-bento-col xo-bento-col--left" style={{ display:'flex', flexDirection:'column', gap:10, minHeight:0 }}>

          {/* Brand card */}
          <div className="xo-bento-card xo-bento-card--brand" style={{ flex:1, minHeight:0, display:'flex', flexDirection:'column' }}>
            <div style={{ position:'absolute', inset:0, borderRadius:'inherit', overflow:'hidden', pointerEvents:'none' }}>
              <div style={{ position:'absolute', width:200, height:200, borderRadius:'50%',
                background:'radial-gradient(circle,rgba(235,177,89,0.22) 0%,transparent 65%)',
                top:-70, right:-50, filter:'blur(22px)' }} />
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:12, position:'relative', marginBottom:14 }}>
              <div style={{
                width:46, height:46, borderRadius:15, flexShrink:0,
                background:'linear-gradient(145deg,rgba(235,177,89,0.28),rgba(238,111,83,0.12))',
                border:'1px solid rgba(235,177,89,0.35)',
                display:'flex', alignItems:'center', justifyContent:'center',
                boxShadow:'0 0 24px rgba(235,177,89,0.2), inset 0 1px 0 rgba(255,255,255,0.1)',
              }}>
                <svg width="18" height="18" fill="none" stroke="#EBB159" viewBox="0 0 24 24"
                  style={{ filter:'drop-shadow(0 0 6px rgba(235,177,89,0.7))' }}>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
                    d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
              <div>
                <div style={{ fontFamily:'"Syne",sans-serif', fontSize:16, fontWeight:800, color:'#fff', letterSpacing:'-0.03em', lineHeight:1.1 }}>Usage Tracking</div>
                <div style={{ display:'flex', alignItems:'center', gap:5, marginTop:4 }}>
                  <div style={{ width:6, height:6, borderRadius:'50%', background:'#EBB159',
                    boxShadow:'0 0 6px rgba(235,177,89,0.8)', animation:'pulse-dot 2.5s ease-in-out infinite' }} />
                  <span style={{ fontSize:11, color:'rgba(255,255,255,0.35)', fontWeight:500 }}>Live Data</span>
                </div>
              </div>
            </div>
            <div style={{ height:1, background:'linear-gradient(90deg,rgba(235,177,89,0.2),transparent)', marginBottom:14, position:'relative' }} />

            {/* Stat pills */}
            <div style={{ display:'flex', flexDirection:'column', gap:8, position:'relative' }}>
              {[
                { label:'Sessions',       value: stats.totalSessions,           color:'rgba(235,177,89,0.9)'  },
                { label:'Time Spent',     value: formatDuration(stats.totalTimeSpent), color:'rgba(99,179,237,0.85)' },
                { label:'Messages Sent',  value: stats.chatMessagesUser,        color:'rgba(99,179,237,0.85)' },
                { label:'Notes Created',  value: stats.notesCreated,            color:'rgba(167,243,208,0.85)'},
                { label:'Captions Made',  value: stats.videoCaptionsGenerated,  color:'rgba(236,144,86,0.85)' },
                { label:'Tool Calls',     value: stats.chatToolCalls,           color:'rgba(167,243,208,0.85)'},
              ].map(row => (
                <div key={row.label} style={{
                  display:'flex', justifyContent:'space-between', alignItems:'center',
                  padding:'7px 10px', borderRadius:10,
                  background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.05)',
                }}>
                  <span style={{ fontSize:11, color:'rgba(255,255,255,0.35)' }}>{row.label}</span>
                  <span style={{ fontSize:12, color:row.color, fontWeight:700, fontFamily:'"Syne",sans-serif' }}>{row.value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Actions card */}
          <div className="xo-bento-card" style={{ padding:'16px 18px', flex:'none' }}>
            <div style={{ fontSize:9, fontWeight:700, color:'rgba(255,255,255,0.3)', letterSpacing:'0.1em', textTransform:'uppercase', marginBottom:10 }}>Actions</div>
            <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
              <button onClick={handleRefresh} style={{
                display:'flex', alignItems:'center', justifyContent:'center', gap:7,
                padding:'9px', borderRadius:10, border:'1px solid rgba(235,177,89,0.25)',
                background:'rgba(235,177,89,0.08)', color:'rgba(235,177,89,0.85)',
                fontSize:11, fontWeight:600, cursor:'pointer', transition:'all 0.18s', fontFamily:'inherit',
              }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background='rgba(235,177,89,0.18)' }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background='rgba(235,177,89,0.08)' }}
              >
                <RefreshIcon spinning={spinning} /> Refresh
              </button>
              <button onClick={handleExport} style={{
                display:'flex', alignItems:'center', justifyContent:'center', gap:7,
                padding:'9px', borderRadius:10, border:'1px solid rgba(255,255,255,0.1)',
                background:'rgba(255,255,255,0.04)', color:'rgba(255,255,255,0.55)',
                fontSize:11, fontWeight:600, cursor:'pointer', transition:'all 0.18s', fontFamily:'inherit',
              }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background='rgba(255,255,255,0.09)'; (e.currentTarget as HTMLButtonElement).style.color='#fff' }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background='rgba(255,255,255,0.04)'; (e.currentTarget as HTMLButtonElement).style.color='rgba(255,255,255,0.55)' }}
              >
                <svg width="12" height="12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 15V3"/>
                </svg>
                Export JSON
              </button>
              <button onClick={handleClear} style={{
                display:'flex', alignItems:'center', justifyContent:'center', gap:7,
                padding:'9px', borderRadius:10, border:'1px solid rgba(239,68,68,0.2)',
                background:'rgba(239,68,68,0.06)', color:'rgba(239,68,68,0.65)',
                fontSize:11, fontWeight:600, cursor:'pointer', transition:'all 0.18s', fontFamily:'inherit',
              }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background='rgba(239,68,68,0.16)'; (e.currentTarget as HTMLButtonElement).style.color='#f87171' }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background='rgba(239,68,68,0.06)'; (e.currentTarget as HTMLButtonElement).style.color='rgba(239,68,68,0.65)' }}
              >
                <svg width="12" height="12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                </svg>
                Clear Data
              </button>
            </div>
          </div>

        </div>{/* end left col */}

        {/* ═══ RIGHT COLUMN ═══ */}
        <div className="xo-bento-col xo-bento-col--right" style={{ display:'flex', flexDirection:'column', gap:10, minHeight:0 }}>

          {/* ── Row 1: 4 stat cards ── */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:10, flexShrink:0 }}>
            {([
              { label:'Sessions',    value: stats.totalSessions,          sub: formatDuration(stats.totalTimeSpent)+' total', color:'rgba(235,177,89,0.9)',  bg:'rgba(235,177,89,0.06)',  border:'rgba(235,177,89,0.18)',
                icon:<svg width="13" height="13" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg> },
              { label:'Messages',   value: stats.chatMessagesUser,        sub: stats.chatMessagesAI+' AI replies',             color:'rgba(99,179,237,0.9)',  bg:'rgba(99,179,237,0.06)',  border:'rgba(99,179,237,0.18)',
                icon:<svg width="13" height="13" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-4 4v-4z"/></svg> },
              { label:'Notes',      value: stats.notesCreated,            sub: stats.notesEdited+' edits',                    color:'rgba(167,243,208,0.9)', bg:'rgba(167,243,208,0.05)', border:'rgba(167,243,208,0.16)',
                icon:<svg width="13" height="13" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg> },
              { label:'Captions',   value: stats.videoCaptionsGenerated,  sub: stats.videoFilesProcessed+' videos',            color:'rgba(236,144,86,0.9)',  bg:'rgba(236,144,86,0.06)',  border:'rgba(236,144,86,0.18)',
                icon:<svg width="13" height="13" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 10l4.553-2.276A1 1 0 0121 8.723v6.554a1 1 0 01-1.447.894L15 14M4 8a2 2 0 012-2h9a2 2 0 012 2v8a2 2 0 01-2 2H6a2 2 0 01-2-2V8z"/></svg> },
            ] as const).map(s => (
              <div key={s.label} className="xo-bento-card" style={{ padding:'14px 14px', background:s.bg, borderColor:s.border }}>
                <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:8 }}>
                  <div style={{ color:s.color }}>{s.icon}</div>
                  <span style={{ fontSize:9, color:'rgba(255,255,255,0.32)', fontWeight:600, letterSpacing:'0.06em', textTransform:'uppercase' }}>{s.label}</span>
                </div>
                <div style={{ fontSize:26, fontWeight:800, color:s.color, fontFamily:'"Syne",sans-serif', lineHeight:1, marginBottom:3 }}>{s.value}</div>
                <div style={{ fontSize:9, color:'rgba(255,255,255,0.28)' }}>{s.sub}</div>
              </div>
            ))}
          </div>


          {/* ── Row 2: Feature breakdown + AI details ── */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, flexShrink:0 }}>

            {/* Feature usage */}
            <div className="xo-bento-card" style={{ padding:'18px 18px' }}>
              <div style={{ fontSize:11, fontWeight:700, color:'#fff', marginBottom:12, letterSpacing:'-0.01em' }}>Feature Usage</div>
              <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                {([
                  { key:'chat',     label:'AI Assistant',     count:stats.featuresUsed.chat,     color:'rgba(99,179,237,0.85)'  },
                  { key:'notes',    label:'Notes',            count:stats.featuresUsed.notes,    color:'rgba(167,243,208,0.85)' },
                  { key:'video',    label:'Video Summarizer', count:stats.featuresUsed.video,    color:'rgba(236,144,86,0.85)'  },
                  { key:'settings', label:'Settings',         count:stats.featuresUsed.settings, color:'rgba(255,255,255,0.38)' },
                ] as const).map(f => {
                  const tot = Math.max(stats.featuresUsed.chat+stats.featuresUsed.notes+stats.featuresUsed.video+stats.featuresUsed.settings, 1)
                  const pct = Math.round((f.count/tot)*100)
                  return (
                    <div key={f.key}>
                      <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
                        <span style={{ fontSize:10, color:'rgba(255,255,255,0.5)', display:'flex', alignItems:'center', gap:4 }}>
                          {mostUsed===f.key && <span style={{ width:4, height:4, borderRadius:'50%', background:f.color, display:'inline-block', flexShrink:0, boxShadow:`0 0 4px ${f.color}` }} />}
                          {f.label}
                        </span>
                        <span style={{ fontSize:10, color:f.color, fontWeight:700 }}>{f.count} <span style={{ color:'rgba(255,255,255,0.22)', fontWeight:400 }}>({pct}%)</span></span>
                      </div>
                      <div style={{ height:3, borderRadius:99, background:'rgba(255,255,255,0.05)', overflow:'hidden' }}>
                        <div style={{ height:'100%', borderRadius:99, width:`${pct}%`, background:f.color, transition:'width 0.6s cubic-bezier(0.16,1,0.3,1)' }} />
                      </div>
                    </div>
                  )
                })}
              </div>
              <div style={{ marginTop:10, padding:'6px 10px', borderRadius:8, background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.05)' }}>
                <span style={{ fontSize:10, color:'rgba(255,255,255,0.28)' }}>Top Feature: </span>
                <span style={{ fontSize:10, color:'rgba(235,177,89,0.85)', fontWeight:700, textTransform:'capitalize' }}>{mostUsed}</span>
              </div>
            </div>

            {/* AI breakdown */}
            <div className="xo-bento-card" style={{ padding:'18px 18px' }}>
              <div style={{ fontSize:11, fontWeight:700, color:'#fff', marginBottom:12, letterSpacing:'-0.01em' }}>AI Details</div>
              <div style={{ display:'flex', flexDirection:'column', gap:7 }}>
                {[
                  { label:'User Messages',      value: stats.chatMessagesUser,  color:'rgba(235,177,89,0.85)'  },
                  { label:'AI Responses',       value: stats.chatMessagesAI,    color:'rgba(99,179,237,0.85)'  },
                  { label:'Tool Calls',         value: stats.chatToolCalls,     color:'rgba(167,243,208,0.85)' },
                  { label:'Chat Sessions',      value: stats.chatSessions,      color:'rgba(255,255,255,0.4)'  },
                  { label:'Total Interactions', value: totalInteractions,       color:'rgba(235,177,89,0.65)'  },
                ].map(row => (
                  <div key={row.label} style={{
                    display:'flex', justifyContent:'space-between', alignItems:'center',
                    padding:'6px 9px', borderRadius:8,
                    background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.05)',
                  }}>
                    <span style={{ fontSize:10, color:'rgba(255,255,255,0.32)' }}>{row.label}</span>
                    <span style={{ fontSize:12, color:row.color, fontWeight:700, fontFamily:'"Syne",sans-serif' }}>{row.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>


          {/* ── Row 3: Activity chart (full width in right col) ── */}
          <div className="xo-bento-card" style={{ padding:'18px 20px', flex:1, minHeight:0, display:'flex', flexDirection:'column' }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12 }}>
              <div style={{ fontSize:11, fontWeight:700, color:'#fff', letterSpacing:'-0.01em' }}>Activity — Last 14 Days</div>
              <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                {[
                  { dot:'rgba(235,177,89,0.9)', label:'Today' },
                  { dot:'rgba(235,177,89,0.45)', label:'Past' },
                ].map(l => (
                  <div key={l.label} style={{ display:'flex', alignItems:'center', gap:4 }}>
                    <div style={{ width:6, height:6, borderRadius:2, background:l.dot }} />
                    <span style={{ fontSize:9, color:'rgba(255,255,255,0.25)' }}>{l.label}</span>
                  </div>
                ))}
                <button onClick={handleRefresh} title="Refresh chart" style={{
                  width:22, height:22, borderRadius:6, border:'1px solid rgba(255,255,255,0.08)',
                  background:'rgba(255,255,255,0.04)', color:'rgba(255,255,255,0.35)',
                  cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center',
                  transition:'all 0.15s',
                }}
                  onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background='rgba(235,177,89,0.12)'; (e.currentTarget as HTMLButtonElement).style.color='rgba(235,177,89,0.85)'; (e.currentTarget as HTMLButtonElement).style.borderColor='rgba(235,177,89,0.25)' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background='rgba(255,255,255,0.04)'; (e.currentTarget as HTMLButtonElement).style.color='rgba(255,255,255,0.35)'; (e.currentTarget as HTMLButtonElement).style.borderColor='rgba(255,255,255,0.08)' }}
                >
                  <RefreshIcon spinning={spinning} />
                </button>
              </div>
            </div>
            <div style={{ flex:1, minHeight:0 }}>
              <ActivityChart dailyStats={stats.dailyStats} />
            </div>
          </div>
          {/* ── Row 4: Averages + Session + Notes + Dates ── */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:10, flexShrink:0 }}>

            {/* Daily averages */}
            <div className="xo-bento-card" style={{ padding:'16px 16px' }}>
              <div style={{ fontSize:10, fontWeight:700, color:'rgba(255,255,255,0.5)', marginBottom:10, letterSpacing:'-0.01em' }}>Daily Averages</div>
              <div style={{ display:'flex', flexDirection:'column', gap:7 }}>
                {[
                  { label:'Messages/day', value: averages.avgMessagesPerDay },
                  { label:'Notes/day',    value: averages.avgNotesPerDay    },
                  { label:'Captions/day', value: averages.avgCaptionsPerDay },
                ].map(a => (
                  <div key={a.label} style={{ display:'flex', justifyContent:'space-between' }}>
                    <span style={{ fontSize:10, color:'rgba(255,255,255,0.28)' }}>{a.label}</span>
                    <span style={{ fontSize:11, color:'rgba(235,177,89,0.85)', fontWeight:700 }}>{a.value}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Session stats */}
            <div className="xo-bento-card" style={{ padding:'16px 16px' }}>
              <div style={{ fontSize:10, fontWeight:700, color:'rgba(255,255,255,0.5)', marginBottom:10, letterSpacing:'-0.01em' }}>Session Stats</div>
              <div style={{ display:'flex', flexDirection:'column', gap:7 }}>
                {[
                  { label:'Total Sessions',   value: stats.totalSessions.toString()               },
                  { label:'Total Time',       value: formatDuration(stats.totalTimeSpent)          },
                  { label:'Avg/Session',      value: formatDuration(averages.avgTimePerSession)    },
                ].map(a => (
                  <div key={a.label} style={{ display:'flex', justifyContent:'space-between' }}>
                    <span style={{ fontSize:10, color:'rgba(255,255,255,0.28)' }}>{a.label}</span>
                    <span style={{ fontSize:11, color:'rgba(99,179,237,0.85)', fontWeight:700 }}>{a.value}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Notes + dates */}
            <div className="xo-bento-card" style={{ padding:'16px 16px' }}>
              <div style={{ fontSize:10, fontWeight:700, color:'rgba(255,255,255,0.5)', marginBottom:10, letterSpacing:'-0.01em' }}>Notes Stats</div>
              <div style={{ display:'flex', flexDirection:'column', gap:7 }}>
                {[
                  { label:'Created', value: stats.notesCreated.toString(),  color:'rgba(167,243,208,0.85)' },
                  { label:'Edited',  value: stats.notesEdited.toString(),   color:'rgba(167,243,208,0.65)' },
                  { label:'Deleted', value: stats.notesDeleted.toString(),  color:'rgba(239,68,68,0.65)'   },
                ].map(a => (
                  <div key={a.label} style={{ display:'flex', justifyContent:'space-between' }}>
                    <span style={{ fontSize:10, color:'rgba(255,255,255,0.28)' }}>{a.label}</span>
                    <span style={{ fontSize:11, color:a.color, fontWeight:700 }}>{a.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ── Row 5: First/Last used footer bar ── */}
          <div className="xo-bento-card" style={{ padding:'12px 18px', flexShrink:0, display:'flex', alignItems:'center', justifyContent:'space-between' }}>
            <div style={{ display:'flex', gap:24 }}>
              {[
                { label:'First Used',   ts: stats.firstSessionDate },
                { label:'Last Active',  ts: stats.lastSessionDate  },
              ].map(d => (
                <div key={d.label} style={{ display:'flex', flexDirection:'column', gap:1 }}>
                  <span style={{ fontSize:9, color:'rgba(255,255,255,0.25)', fontWeight:600, letterSpacing:'0.07em', textTransform:'uppercase' }}>{d.label}</span>
                  <span style={{ fontSize:11, color:'rgba(255,255,255,0.6)', fontFamily:'monospace' }}>
                    {new Date(d.ts).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}
                  </span>
                </div>
              ))}
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:6 }}>
              <div style={{ width:6, height:6, borderRadius:'50%', background:'#EBB159',
                boxShadow:'0 0 6px rgba(235,177,89,0.8)', animation:'pulse-dot 2.5s ease-in-out infinite' }} />
              <span style={{ fontSize:10, color:'rgba(235,177,89,0.65)', fontWeight:600 }}>Tracking Active</span>
            </div>
          </div>

        </div>

      {/* Export modal — position:fixed so it escapes the bento layout */}
      {showExport && (
        <div style={{
          position:'fixed', inset:0, zIndex:9999,
          background:'rgba(0,0,0,0.75)', backdropFilter:'blur(12px)',
          display:'flex', alignItems:'center', justifyContent:'center',
        }} onClick={() => setShowExport(false)}>
          <div style={{
            width:520, maxWidth:'90vw', borderRadius:24,
            background:'rgba(14,10,6,0.97)', border:'1px solid rgba(235,177,89,0.25)',
            padding:'24px', boxShadow:'0 32px 80px rgba(0,0,0,0.8)',
            animation:'fadeIn 0.25s ease both',
          }} onClick={e => e.stopPropagation()}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
              <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                <div style={{ width:30, height:30, borderRadius:9, background:'rgba(235,177,89,0.12)',
                  border:'1px solid rgba(235,177,89,0.25)', display:'flex', alignItems:'center', justifyContent:'center' }}>
                  <svg width="13" height="13" fill="none" stroke="rgba(235,177,89,0.9)" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 15V3"/>
                  </svg>
                </div>
                <span style={{ fontSize:14, fontWeight:700, color:'#fff' }}>Export Usage Data</span>
              </div>
              <button onClick={() => setShowExport(false)} style={{
                width:28, height:28, borderRadius:8, border:'none', background:'transparent',
                color:'rgba(255,255,255,0.3)', cursor:'pointer', fontSize:16,
                display:'flex', alignItems:'center', justifyContent:'center',
              }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color='#f87171'; (e.currentTarget as HTMLButtonElement).style.background='rgba(239,68,68,0.1)' }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color='rgba(255,255,255,0.3)'; (e.currentTarget as HTMLButtonElement).style.background='transparent' }}
              >✕</button>
            </div>
            <textarea readOnly value={exportData} style={{
              width:'100%', height:240, borderRadius:12,
              background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.08)',
              color:'rgba(255,255,255,0.7)', fontFamily:'monospace', fontSize:10,
              padding:'12px', resize:'none', outline:'none',
            }} />
            <div style={{ display:'flex', gap:8, marginTop:12 }}>
              <button onClick={() => { navigator.clipboard.writeText(exportData) }} style={{
                flex:1, padding:'10px', borderRadius:10, border:'none', cursor:'pointer',
                background:'linear-gradient(135deg,#EBB159,#EE6F53)',
                color:'#fff', fontSize:12, fontWeight:700, fontFamily:'inherit',
              }}>Copy to Clipboard</button>
              <button onClick={() => setShowExport(false)} style={{
                padding:'10px 18px', borderRadius:10, border:'1px solid rgba(255,255,255,0.1)',
                background:'transparent', color:'rgba(255,255,255,0.4)', fontSize:12,
                cursor:'pointer', fontFamily:'inherit',
              }}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
