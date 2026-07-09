import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import type { AppItem, Note, AppControl } from './types'
import { APP_TOOLS, makeExecutor } from './appBridge'
import { sendToGeminiWithTools, sendToGeminiWithSystem } from './gemini'
import type { ToolCallRequest } from './fireworks'

/* â”€â”€ Nav items â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
const APPS: AppItem[] = [
  { id: 'home',     label: 'Home'            },
  { id: 'chat',     label: 'Assistant'       },
  { id: 'notes',    label: 'Notes'           },
  { id: 'video',    label: 'Video Summarizer'  },
  { id: 'usage',    label: 'Usage Tracking'  },
  { id: 'settings', label: 'Settings'        },
]

/* â”€â”€ Icon helper â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
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
    case 'video':
      return (
        <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
            d="M15 10l4.553-2.276A1 1 0 0121 8.723v6.554a1 1 0 01-1.447.894L15 14M4 8a2 2 0 012-2h9a2 2 0 012 2v8a2 2 0 01-2 2H6a2 2 0 01-2-2V8z" />
        </svg>
      )
    case 'usage':
      return (
        <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
            d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
      )
    default: return null
  }
  void s
}

/* â”€â”€ Sidebar â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
interface SidebarProps {
  activeId: string
  onSelect: (id: string) => void
}

function Sidebar({ activeId, onSelect }: SidebarProps) {
  return (
    <nav className="web-island">
      {/* Logo pill */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        width: 38, height: 38, flexShrink: 0,
      }}>
        <span style={{
          fontFamily: '"Syne", sans-serif',
          color: '#EBB159', fontWeight: 800, fontSize: 13, letterSpacing: '-0.04em',
          textShadow: '0 0 12px rgba(235,177,89,0.7), 0 0 24px rgba(238,111,83,0.5)',
        }}>XO</span>
      </div>

      <div className="web-island-divider" />

      {/* Nav buttons */}
      {APPS.map((app, i) => (
        <div key={app.id} style={{ display: 'contents' }}>
          <button
            className={`web-island-btn${activeId === app.id ? ' active' : ''}`}
            onClick={() => onSelect(app.id)}
          >
            <NavIcon id={app.id} />
            <span className="web-tooltip">{app.label}</span>
          </button>
          {i === 0 && <div className="web-island-divider" />}
        </div>
      ))}

      <div className="web-island-divider" />

      {/* Status dot */}
      <div style={{ width: 38, height: 38, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="status-dot" />
      </div>
    </nav>
  )
}

/* â”€â”€ Home / welcome panel â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
function HomePanel({ onNavigate }: { onNavigate: (id: string) => void }) {
  const tracks = [
    {
      num: '01',
      label: 'Track 1',
      title: 'General-Purpose AI Agent',
      desc: '8-category agent: factual knowledge, math, sentiment, summarisation, NER, code debug, logic, and code generation "” all via Fireworks AI.',
      chips: ['Factual', 'Math', 'Code', 'Logic', 'NER'],
      color: 'rgba(235,177,89,0.95)',
      glow: 'rgba(235,177,89,0.07)',
      border: 'rgba(235,177,89,0.22)',
      iconBg: 'rgba(235,177,89,0.1)',
      navId: 'chat',
      icon: (
        <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
            d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>
      ),
    },
    {
      num: '02',
      label: 'Track 2',
      title: 'Video Captioning Agent',
      desc: 'Watch a video clip and generate captions in 4 styles: Formal, Sarcastic, Humorous Tech, and Humorous Non-Tech.',
      chips: ['Formal', 'Sarcastic', 'Humorous Tech', 'Non-Tech'],
      color: 'rgba(236,144,86,0.95)',
      glow: 'rgba(236,144,86,0.07)',
      border: 'rgba(236,144,86,0.22)',
      iconBg: 'rgba(236,144,86,0.1)',
      navId: 'video',
      icon: (
        <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
            d="M15 10l4.553-2.276A1 1 0 0121 8.723v6.554a1 1 0 01-1.447.894L15 14M4 8a2 2 0 012-2h9a2 2 0 012 2v8a2 2 0 01-2 2H6a2 2 0 01-2-2V8z" />
        </svg>
      ),
    },
    {
      num: '03',
      label: 'Track 3',
      title: 'XO Screens \u2014 Unicorn (Real-Time Screen Reading)',
      desc: 'Full AI productivity workspace: chat assistant, smart notes, video summarizer, and usage tracking \u2014 all powered by AMD compute.',
      chips: [] as string[],
      cta: true,
      color: 'rgba(238,111,83,0.95)',
      glow: 'rgba(238,111,83,0.07)',
      border: 'rgba(238,111,83,0.22)',
      iconBg: 'rgba(238,111,83,0.1)',
      navId: 'chat',
      icon: (
        <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
            d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
      ),
    },
  ]

  return (
    <div className="xo-home" style={{ overflowY: 'auto', alignItems: 'center' }}>
      {/* Badge */}
      <div style={{ marginBottom: 18, animation: 'fadeIn 0.5s ease both' }}>
        <span className="web-hero-badge">
          <span className="web-hero-badge-dot" />
          AMD Developer Hackathon · ACT II
        </span>
      </div>

      {/* Title */}
      <h1 className="xo-hero-title" style={{ textAlign: 'center', animation: 'fadeIn 0.5s 0.05s ease both' }}>
        XO Screens.
      </h1>

      {/* Subtitle */}
      <p className="xo-hero-sub" style={{ animation: 'fadeIn 0.5s 0.1s ease both' }}>
        Competing across all three tracks. One platform, three submissions.
      </p>

      {/* Track cards */}
      <div style={{
        display: 'flex', flexDirection: 'column', gap: 10,
        width: '100%', maxWidth: 600,
        animation: 'fadeIn 0.5s 0.15s ease both',
      }}>
        {tracks.map((t, i) => (
          <button
            key={t.num}
            onClick={() => onNavigate(t.navId)}
            style={{
              display: 'flex', alignItems: 'flex-start', gap: 16,
              padding: '16px 18px', borderRadius: 16, cursor: 'pointer',
              background: t.glow, border: `1px solid ${t.border}`,
              transition: 'all 0.2s cubic-bezier(0.16,1,0.3,1)', textAlign: 'left',
              animation: `fadeIn 0.4s ${0.1 + i * 0.07}s ease both`,
            }}
            onMouseEnter={e => {
              const el = e.currentTarget as HTMLButtonElement
              el.style.transform = 'translateY(-2px)'
              el.style.boxShadow = `0 16px 48px ${t.glow}, 0 0 0 1px ${t.border}`
            }}
            onMouseLeave={e => {
              const el = e.currentTarget as HTMLButtonElement
              el.style.transform = ''
              el.style.boxShadow = ''
            }}
          >
            {/* Track number */}
            <div style={{
              fontFamily: '"Syne", sans-serif',
              fontSize: 11, fontWeight: 800, color: t.color,
              letterSpacing: '0.06em', flexShrink: 0, paddingTop: 2,
              opacity: 0.7,
            }}>{t.num}</div>

            {/* Icon */}
            <div style={{
              width: 38, height: 38, borderRadius: 11, flexShrink: 0,
              background: t.iconBg, border: `1px solid ${t.border}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: t.color,
            }}>
              {t.icon}
            </div>

            {/* Content */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <span style={{
                  fontSize: 9, fontWeight: 700, letterSpacing: '0.08em',
                  textTransform: 'uppercase', color: t.color,
                  background: t.iconBg, border: `1px solid ${t.border}`,
                  padding: '2px 7px', borderRadius: 5,
                }}>{t.label}</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#fff', letterSpacing: '-0.01em' }}>
                  {t.num === '03'
                    ? <><span>XO Screens — Unicorn</span><span style={{ opacity: 0.35, fontWeight: 500 }}> (Real-Time Screen Reading)</span></>
                    : t.title}
                </span>
              </div>
              <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.38)', lineHeight: 1.6, margin: '0 0 10px' }}>{t.desc}</p>
              {/* Download CTA for Track 3 */}
              {t.cta && (
                <div style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  fontSize: 10, fontWeight: 600, letterSpacing: '0.04em',
                  color: 'rgba(238,111,83,0.85)',
                  background: 'rgba(238,111,83,0.08)',
                  border: '1px solid rgba(238,111,83,0.2)',
                  padding: '4px 10px', borderRadius: 6,
                  marginBottom: 10,
                }}>
                  <svg width="10" height="10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5}
                      d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 15V3" />
                  </svg>
                  Download App for more Features
                </div>
              )}
              {/* Chips */}
              <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                {t.chips.map(chip => (
                  <span key={chip} style={{
                    fontSize: 9, fontWeight: 600, letterSpacing: '0.05em',
                    padding: '2px 8px', borderRadius: 5,
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.09)',
                    color: 'rgba(255,255,255,0.35)',
                  }}>{chip}</span>
                ))}
              </div>
            </div>

            {/* Arrow */}
            <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"
              style={{ color: 'rgba(255,255,255,0.18)', flexShrink: 0, marginTop: 12 }}>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        ))}
      </div>

      {/* Footer */}
      <div style={{ marginTop: 28, display: 'flex', alignItems: 'center', gap: 16, animation: 'fadeIn 0.5s 0.35s ease both' }}>
        {[
          { label: 'Fireworks AI', dot: 'rgba(235,177,89,0.85)' },
          { label: 'AMD Compute', dot: 'rgba(238,111,83,0.85)' },
          { label: 'DeepSeek V4', dot: 'rgba(236,144,86,0.85)' },
        ].map(f => (
          <div key={f.label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 4, height: 4, borderRadius: '50%', background: f.dot, display: 'inline-block' }} />
            <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.22)', fontWeight: 500, letterSpacing: '0.04em' }}>{f.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/* â”€â”€ Settings panel â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
function SettingsPanel() {
  // true  = a key is already stored and we're in "locked" view
  // false = no key yet, or user chose to replace/delete
  const [keyLocked, setKeyLocked] = useState(() => !!localStorage.getItem('xo-fireworks-api-key'))
  const [newKey, setNewKey] = useState('')
  const [saved, setSaved] = useState(false)

  function handleSave() {
    const trimmed = newKey.trim()
    if (!trimmed) return
    localStorage.setItem('xo-fireworks-api-key', trimmed)
    setNewKey('')
    setKeyLocked(true)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  function handleDelete() {
    localStorage.removeItem('xo-fireworks-api-key')
    setNewKey('')
    setKeyLocked(false)
    setSaved(false)
  }

  return (
    <div className="web-panel-main" style={{ padding: '28px 32px', overflowY: 'auto' }}>
      <div style={{ maxWidth: 520 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.02em', marginBottom: 6 }}>Settings</h2>
        <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.3)', marginBottom: 32 }}>Configure your XO Screens workspace.</p>

        {/* API key section */}
        <div style={{ marginBottom: 28 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 12 }}>
            Fireworks AI
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>

            {keyLocked ? (
              /* Key already set: show masked pill + action buttons */
              <>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  background: 'rgba(16,185,129,0.07)', border: '1px solid rgba(16,185,129,0.2)',
                  borderRadius: 10, padding: '10px 14px',
                }}>
                  <svg width="13" height="13" fill="none" stroke="rgba(16,185,129,0.7)" viewBox="0 0 24 24" style={{ flexShrink: 0 }}>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                  <span style={{ fontSize: 12, fontFamily: 'monospace', color: 'rgba(16,185,129,0.85)', flex: 1, letterSpacing: '0.05em' }}>
                    fw_&#x2022;&#x2022;&#x2022;&#x2022;&#x2022;&#x2022;&#x2022;&#x2022;&#x2022;&#x2022;&#x2022;&#x2022;&#x2022;&#x2022;&#x2022;&#x2022;&#x2022;&#x2022;&#x2022;&#x2022;
                  </span>
                  {saved && (
                    <span style={{ fontSize: 11, color: 'rgba(16,185,129,0.7)', fontWeight: 600 }}>&#x2713; Saved</span>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => { setKeyLocked(false); setNewKey('') }} style={{
                    flex: 1, padding: '10px', borderRadius: 10,
                    border: '1px solid rgba(235,177,89,0.3)',
                    background: 'rgba(235,177,89,0.08)', color: 'rgba(235,177,89,0.9)',
                    fontSize: 12, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer', transition: 'all 0.2s',
                  }}
                    onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(235,177,89,0.16)' }}
                    onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(235,177,89,0.08)' }}
                  >
                    Replace Key
                  </button>
                  <button onClick={handleDelete} style={{
                    flex: 1, padding: '10px', borderRadius: 10,
                    border: '1px solid rgba(239,68,68,0.25)',
                    background: 'rgba(239,68,68,0.08)', color: 'rgba(239,68,68,0.7)',
                    fontSize: 12, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer', transition: 'all 0.2s',
                  }}
                    onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(239,68,68,0.18)'; (e.currentTarget as HTMLButtonElement).style.color = '#f87171' }}
                    onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(239,68,68,0.08)'; (e.currentTarget as HTMLButtonElement).style.color = 'rgba(239,68,68,0.7)' }}
                  >
                    Delete Key
                  </button>
                </div>
              </>
            ) : (
              /* No key yet (or replace mode): show entry input */
              <>
                <input
                  type="password"
                  value={newKey}
                  onChange={e => setNewKey(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSave()}
                  placeholder="fw_&#x2022;&#x2022;&#x2022;&#x2022;&#x2022;&#x2022;&#x2022;&#x2022;&#x2022;&#x2022;&#x2022;&#x2022;&#x2022;&#x2022;&#x2022;&#x2022;&#x2022;&#x2022;&#x2022;&#x2022;"
                  spellCheck={false}
                  autoComplete="off"
                  style={{
                    width: '100%', boxSizing: 'border-box',
                    background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: 10, padding: '10px 14px',
                    color: '#fff', fontSize: 12, fontFamily: 'monospace', outline: 'none',
                  }}
                  onFocus={e => { e.currentTarget.style.borderColor = 'rgba(235,177,89,0.5)' }}
                  onBlur={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)' }}
                />
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={handleSave} disabled={!newKey.trim()} style={{
                    flex: 1, padding: '10px', borderRadius: 10, border: 'none',
                    cursor: newKey.trim() ? 'pointer' : 'default',
                    background: newKey.trim() ? 'linear-gradient(135deg, #EBB159, #EE6F53)' : 'rgba(235,177,89,0.15)',
                    color: newKey.trim() ? '#fff' : 'rgba(255,255,255,0.3)',
                    fontSize: 12, fontWeight: 600, fontFamily: 'inherit', transition: 'all 0.2s',
                  }}>
                    Save API Key
                  </button>
                  {localStorage.getItem('xo-fireworks-api-key') && (
                    <button onClick={() => { setKeyLocked(true); setNewKey('') }} style={{
                      padding: '10px 16px', borderRadius: 10,
                      border: '1px solid rgba(255,255,255,0.1)',
                      background: 'transparent', color: 'rgba(255,255,255,0.35)',
                      fontSize: 12, fontWeight: 500, fontFamily: 'inherit', cursor: 'pointer', transition: 'all 0.2s',
                    }}>
                      Cancel
                    </button>
                  )}
                </div>
              </>
            )}

            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)', lineHeight: 1.6 }}>
              Get your key at{' '}
              <a href="https://fireworks.ai" target="_blank" rel="noreferrer"
                style={{ color: 'rgba(235,177,89,0.8)', textDecoration: 'none' }}>fireworks.ai</a>
              . Stored locally in your browser only.
            </div>
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
              { label: 'Provider', value: 'Fireworks AI' },
            ].map(row => (
              <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)' }}>{row.label}</span>
                <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.65)', fontFamily: 'monospace' }}>{row.value}</span>
              </div>
            ))}
            {/* Created by */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', paddingTop: 2 }}>
              <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)' }}>Created by</span>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
                <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.65)', fontFamily: 'monospace' }}>Team Forge</span>
                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', fontFamily: 'monospace' }}>Cid &amp; Rin</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/* â”€â”€ Web-native chat panel â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
import type { Message, ChatSession } from './types'
import {
  initSessions, newSession, upsertSession, saveSessions, deriveTitleFromMessage, deleteSession,
} from './chatHistory'

// Capability groups "” mirrors overlay ChatBox exactly
const WEB_CAP_GROUPS = [
  {
    id: 'notes_read', label: 'Read Notes',
    description: 'List all notes and read their contents.',
    color: 'rgba(235,177,89,0.9)',
    tools: ['list_notes', 'get_note'],
    icon: <svg width="13" height="13" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>,
  },
  {
    id: 'notes_write', label: 'Write Notes',
    description: 'Create, edit, delete, and focus notes.',
    color: 'rgba(236,144,86,0.9)',
    tools: ['create_note', 'update_note', 'delete_note', 'focus_note'],
    icon: <svg width="13" height="13" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>,
  },
  {
    id: 'caption_history', label: 'Caption History',
    description: 'Read the video captions history.',
    color: 'rgba(238,111,83,0.9)',
    tools: ['get_caption_history'],
    icon: <svg width="13" height="13" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.723v6.554a1 1 0 01-1.447.894L15 14M4 8a2 2 0 012-2h9a2 2 0 012 2v8a2 2 0 01-2 2H6a2 2 0 01-2-2V8z" /></svg>,
  },
] as const

type CapId = typeof WEB_CAP_GROUPS[number]['id']
type EnabledCaps = Record<CapId, boolean>
const CAPS_KEY = 'xo-web-chat-capabilities'
function loadCaps(): EnabledCaps {
  try { return { ...defaultCaps(), ...JSON.parse(localStorage.getItem(CAPS_KEY) ?? '{}') } }
  catch { return defaultCaps() }
}
function defaultCaps(): EnabledCaps {
  return Object.fromEntries(WEB_CAP_GROUPS.map(g => [g.id, true])) as EnabledCaps
}
function saveCaps(c: EnabledCaps) { localStorage.setItem(CAPS_KEY, JSON.stringify(c)) }

function timeAgoChat(ts: number) {
  const d = Date.now() - ts
  if (d < 60_000) return 'just now'
  if (d < 3_600_000) return `${Math.floor(d / 60_000)}m ago`
  if (d < 86_400_000) return `${Math.floor(d / 3_600_000)}h ago`
  return `${Math.floor(d / 86_400_000)}d ago`
}

function CapToggle({ on, onChange, color }: { on: boolean; onChange: (v: boolean) => void; color: string }) {
  return (
    <button onClick={() => onChange(!on)} style={{
      width: 32, height: 18, borderRadius: 99, border: 'none', cursor: 'pointer',
      background: on ? color.replace('0.9', '0.7') : 'rgba(255,255,255,0.1)',
      position: 'relative', flexShrink: 0, transition: 'background 0.2s',
      boxShadow: on ? `0 0 8px ${color.replace('0.9', '0.35')}` : 'none',
    }}>
      <span style={{
        position: 'absolute', top: 2, left: on ? 16 : 2,
        width: 14, height: 14, borderRadius: '50%',
        background: on ? '#fff' : 'rgba(255,255,255,0.4)',
        transition: 'left 0.2s, background 0.2s', display: 'block',
      }} />
    </button>
  )
}

interface WebChatPanelProps {
  activeNote?: Note | null
  appControl?: AppControl
}

function WebChatPanel({ activeNote, appControl }: WebChatPanelProps) {
  const [sessions, setSessions] = useState<ChatSession[]>(() => initSessions().sessions)
  const [activeId, setActiveId] = useState<string>(() => initSessions().active.id)
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [activeTools, setActiveTools] = useState<string[]>([])
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [enabledCaps, setEnabledCaps] = useState<EnabledCaps>(loadCaps)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLDivElement>(null)
  const executorRef = useRef<((c: ToolCallRequest) => Promise<unknown>) | null>(null)

  const activeSession = sessions.find(s => s.id === activeId) ?? sessions[0]
  const messages: Message[] = activeSession?.messages ?? []

  const enabledToolNames: Set<string> = new Set(
    WEB_CAP_GROUPS.filter(g => enabledCaps[g.id]).flatMap(g => [...g.tools])
  )
  const activeAppTools = APP_TOOLS.filter(t => enabledToolNames.has(t.name))

  useEffect(() => { if (appControl) executorRef.current = makeExecutor(appControl) }, [appControl])
  useEffect(() => { saveSessions(sessions) }, [sessions])
  useEffect(() => { saveCaps(enabledCaps) }, [enabledCaps])
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, loading, activeTools])

  function handleNewChat() {
    const s = newSession()
    setSessions(prev => [s, ...prev])
    setActiveId(s.id)
    setSettingsOpen(false)
    setConfirmDeleteId(null)
    setInput('')
  }

  function handleDeleteSession(id: string) {
    const next = deleteSession(sessions, id)
    const fallback = next.length > 0 ? next : [newSession()]
    setSessions(fallback)
    if (activeId === id) setActiveId(fallback[0].id)
    setConfirmDeleteId(null)
  }

  const handleSend = useCallback(async (overrideText?: string) => {
    const text = (overrideText ?? input).trim()
    if (!text || loading) return

    const userMsg: Message = { id: Date.now().toString(), role: 'user', content: text, timestamp: new Date() }
    const isFirstUserMsg = messages.filter(m => m.role === 'user').length === 0
    const newTitle = isFirstUserMsg ? deriveTitleFromMessage(text) : activeSession.title
    const updatedMessages = [...messages, userMsg]

    setSessions(prev => upsertSession(prev, { ...activeSession, title: newTitle, messages: updatedMessages, updatedAt: Date.now() }))
    setInput('')
    setLoading(true)
    setActiveTools([])

    try {
      const noteCtx = activeNote
        ? `The user has a note open titled "${activeNote.title || 'Untitled'}" with content:\n"""\n${activeNote.content || '(empty)'}\n"""\nYou can reference it or edit it using the update_note tool (if write access is enabled).`
        : ''
      const capLines = WEB_CAP_GROUPS.filter(g => enabledCaps[g.id]).map(g => `- ${g.label}: ${g.description}`).join('\n')
      const toolsCtx = appControl && activeAppTools.length > 0
        ? `You have access to XO web app capabilities:\n${capLines}\nUse tools proactively when the user asks you to do something in the app. After taking actions, summarise what you did briefly.`
        : appControl ? 'All app-control capabilities are currently disabled by the user.' : ''
      const systemPrompt = ['You are XO, an intelligent AI assistant running as a web app. Be concise, helpful, and friendly.', toolsCtx, noteCtx].filter(Boolean).join('\n\n')

      let reply: string
      if (appControl && executorRef.current && activeAppTools.length > 0) {
        reply = await sendToGeminiWithTools(
          updatedMessages, text, systemPrompt, activeAppTools,
          executorRef.current,
          (call) => setActiveTools(prev => [...prev, call.name]),
        )
      } else {
        reply = await sendToGeminiWithSystem(updatedMessages, text, systemPrompt)
      }

      setActiveTools([])
      setSessions(prev => upsertSession(prev, {
        ...activeSession, title: newTitle,
        messages: [...updatedMessages, { id: Date.now().toString(), role: 'assistant', content: reply, timestamp: new Date() }],
        updatedAt: Date.now(),
      }))
    } catch (err) {
      setActiveTools([])
      setSessions(prev => upsertSession(prev, {
        ...activeSession, title: newTitle,
        messages: [...updatedMessages, {
          id: Date.now().toString(), role: 'assistant',
          content: `âš ï¸ ${err instanceof Error ? err.message : 'Failed to reach Fireworks AI. Check your API key.'}`,
          timestamp: new Date(),
        }],
        updatedAt: Date.now(),
      }))
    } finally {
      setLoading(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [input, loading, messages, activeSession, activeNote, appControl, enabledCaps, activeAppTools])

  return (
    <>
      {/* Bento Chat Layout */}
      <div className="xo-bento-chat">

        {/* LEFT COLUMN */}
        <div className="xo-bento-col xo-bento-col--left">

          {/* Card 1 - Brand */}
          <div className="xo-bento-card xo-bento-card--brand">
            {/* Glow blob */}
            <div style={{ position:'absolute', inset:0, borderRadius:'inherit', overflow:'hidden', pointerEvents:'none' }}>
              <div style={{ position:'absolute', width:220, height:220, borderRadius:'50%', background:'radial-gradient(circle, rgba(235,177,89,0.22) 0%, transparent 65%)', top:-80, right:-60, filter:'blur(24px)' }} />
              <div style={{ position:'absolute', width:120, height:120, borderRadius:'50%', background:'radial-gradient(circle, rgba(238,111,83,0.12) 0%, transparent 70%)', bottom:-30, left:-20, filter:'blur(16px)' }} />
            </div>
            {/* XO identity */}
            <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:16, position:'relative' }}>
              <div style={{
                width:46, height:46, borderRadius:15, flexShrink:0,
                background:'linear-gradient(145deg, rgba(235,177,89,0.28), rgba(238,111,83,0.14))',
                border:'1px solid rgba(235,177,89,0.35)',
                display:'flex', alignItems:'center', justifyContent:'center',
                boxShadow:'0 0 24px rgba(235,177,89,0.2), inset 0 1px 0 rgba(255,255,255,0.12)',
              }}>
                <span style={{ fontFamily:'"Syne", sans-serif', fontSize:16, fontWeight:800, color:'#EBB159', letterSpacing:'-0.04em', textShadow:'0 0 12px rgba(235,177,89,0.8)' }}>XO</span>
              </div>
              <div>
                <div style={{ fontSize:15, fontWeight:700, color:'#fff', letterSpacing:'-0.02em', lineHeight:1.2 }}>Assistant</div>
                <div style={{ display:'flex', alignItems:'center', gap:6, marginTop:4 }}>
                  <div className="status-dot" />
                  <span style={{ fontSize:11, color:'rgba(255,255,255,0.35)', fontWeight:500, letterSpacing:'0.02em' }}>DeepSeek V4 Pro</span>
                </div>
              </div>
            </div>
            {/* Divider */}
            <div style={{ height:1, background:'linear-gradient(90deg, rgba(235,177,89,0.2), transparent)', marginBottom:14, position:'relative' }} />
            {/* Capability pills */}
            <div style={{ display:'flex', flexDirection:'column', gap:6, position:'relative' }}>
              <div style={{ fontSize:9, fontWeight:700, color:'rgba(255,255,255,0.25)', letterSpacing:'0.1em', textTransform:'uppercase', marginBottom:2 }}>Capabilities</div>
              {WEB_CAP_GROUPS.map(group => {
                const isOn = !!enabledCaps[group.id]
                return (
                  <button
                    key={group.id}
                    onClick={() => setEnabledCaps(prev => ({ ...prev, [group.id]: !isOn }))}
                    title={group.description}
                    style={{
                      display:'flex', alignItems:'center', gap:8,
                      padding:'7px 10px', borderRadius:10, textAlign:'left',
                      background: isOn ? group.color.replace('0.9','0.1') : 'rgba(255,255,255,0.03)',
                      border:`1px solid ${isOn ? group.color.replace('0.9','0.22') : 'rgba(255,255,255,0.06)'}`,
                      cursor:'pointer', transition:'all 0.18s', width:'100%',
                    }}
                  >
                    <div style={{
                      width:20, height:20, borderRadius:6, flexShrink:0,
                      background: isOn ? group.color.replace('0.9','0.15') : 'rgba(255,255,255,0.05)',
                      display:'flex', alignItems:'center', justifyContent:'center',
                      color: isOn ? group.color : 'rgba(255,255,255,0.2)',
                    }}>{group.icon}</div>
                    <span style={{ fontSize:11, fontWeight:600, color: isOn ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.25)', flex:1 }}>{group.label}</span>
                    <div style={{
                      width:6, height:6, borderRadius:'50%', flexShrink:0,
                      background: isOn ? group.color : 'rgba(255,255,255,0.1)',
                      boxShadow: isOn ? `0 0 6px ${group.color.replace('0.9','0.7')}` : 'none',
                      transition:'all 0.18s',
                    }} />
                  </button>
                )
              })}
            </div>
            {/* Note context badge */}
            {activeNote && (
              <div style={{
                marginTop:14, display:'flex', alignItems:'center', gap:7,
                padding:'8px 12px', borderRadius:11,
                background:'rgba(235,177,89,0.08)', border:'1px solid rgba(235,177,89,0.2)',
                position:'relative',
              }}>
                <svg width="10" height="10" fill="none" stroke="rgba(235,177,89,0.8)" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
                <span style={{ fontSize:11, color:'rgba(235,177,89,0.85)', fontWeight:500, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', flex:1 }}>
                  {activeNote.title || 'Untitled'}
                </span>
                <span style={{ fontSize:9, color:'rgba(235,177,89,0.45)', fontWeight:700, letterSpacing:'0.06em', flexShrink:0 }}>CTX</span>
              </div>
            )}
          </div>

          {/* Card 2 - Sessions */}
          <div className="xo-bento-card xo-bento-card--sessions">
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14, flexShrink:0 }}>
              <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                <span style={{ fontSize:11, fontWeight:700, color:'rgba(255,255,255,0.4)', letterSpacing:'0.09em', textTransform:'uppercase' }}>Chats</span>
                <span style={{
                  fontSize:10, fontWeight:700, color:'rgba(255,255,255,0.35)',
                  background:'rgba(255,255,255,0.07)', borderRadius:6, padding:'1px 7px',
                  border:'1px solid rgba(255,255,255,0.06)',
                }}>{sessions.length}</span>
              </div>
              <button
                onClick={handleNewChat}
                style={{
                  height:28, padding:'0 12px', borderRadius:8,
                  border:'1px solid rgba(235,177,89,0.2)',
                  background:'rgba(235,177,89,0.08)', color:'#EBB159',
                  cursor:'pointer', display:'flex', alignItems:'center', gap:5,
                  fontSize:11, fontWeight:700, transition:'all 0.15s', letterSpacing:'0.03em',
                  boxShadow:'0 0 12px rgba(235,177,89,0.08)',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background='rgba(235,177,89,0.16)'; (e.currentTarget as HTMLButtonElement).style.boxShadow='0 0 20px rgba(235,177,89,0.15)' }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background='rgba(235,177,89,0.08)'; (e.currentTarget as HTMLButtonElement).style.boxShadow='0 0 12px rgba(235,177,89,0.08)' }}
              >
                <svg width="9" height="9" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 4v16m8-8H4" />
                </svg>
                New
              </button>
            </div>
            <div className="web-scroll xo-sessions-list">
              {sessions.length === 0 && (
                <div style={{ padding:'28px 8px', textAlign:'center', color:'rgba(255,255,255,0.18)', fontSize:12, lineHeight:1.6 }}>
                  No conversations yet.<br/>Start one above.
                </div>
              )}
              {sessions.map(s => (
                <div key={s.id}>
                  {confirmDeleteId === s.id ? (
                    <div style={{ padding:'10px 12px', borderRadius:12, background:'rgba(239,68,68,0.07)', border:'1px solid rgba(239,68,68,0.2)', display:'flex', alignItems:'center', gap:7, marginBottom:4 }}>
                      <span style={{ fontSize:11, color:'rgba(255,255,255,0.4)', flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>Delete?</span>
                      <button onClick={() => handleDeleteSession(s.id)} style={{ fontSize:11, fontWeight:700, color:'#f87171', background:'rgba(239,68,68,0.16)', border:'1px solid rgba(239,68,68,0.28)', borderRadius:6, padding:'3px 10px', cursor:'pointer' }}>Yes</button>
                      <button onClick={() => setConfirmDeleteId(null)} style={{ fontSize:11, color:'rgba(255,255,255,0.35)', background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.1)', borderRadius:6, padding:'3px 10px', cursor:'pointer' }}>No</button>
                    </div>
                  ) : (
                    <div
                      className="chat-history-row xo-session-row"
                      onClick={() => { setActiveId(s.id); setInput('') }}
                      style={{
                        padding:'10px 12px', borderRadius:12, marginBottom:4,
                        background: s.id === activeId ? 'rgba(235,177,89,0.09)' : 'transparent',
                        border: s.id === activeId ? '1px solid rgba(235,177,89,0.22)' : '1px solid transparent',
                        cursor:'pointer', transition:'all 0.15s', display:'flex', alignItems:'center', gap:10,
                        boxShadow: s.id === activeId ? '0 0 20px rgba(235,177,89,0.06)' : 'none',
                      }}
                      onMouseEnter={e => { if (s.id !== activeId) (e.currentTarget as HTMLDivElement).style.background='rgba(255,255,255,0.04)' }}
                      onMouseLeave={e => { if (s.id !== activeId) (e.currentTarget as HTMLDivElement).style.background='transparent' }}
                    >
                      <div style={{
                        width:32, height:32, borderRadius:10, flexShrink:0,
                        background: s.id === activeId ? 'rgba(235,177,89,0.15)' : 'rgba(255,255,255,0.05)',
                        border:`1px solid ${s.id === activeId ? 'rgba(235,177,89,0.28)' : 'rgba(255,255,255,0.07)'}`,
                        display:'flex', alignItems:'center', justifyContent:'center',
                        boxShadow: s.id === activeId ? '0 0 12px rgba(235,177,89,0.15)' : 'none',
                        transition:'all 0.15s',
                      }}>
                        <span style={{ fontSize:9, fontWeight:800, color: s.id === activeId ? '#EBB159' : 'rgba(255,255,255,0.25)', fontFamily:'"Syne", sans-serif' }}>XO</span>
                      </div>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontSize:12, fontWeight: s.id === activeId ? 600 : 400, color: s.id === activeId ? '#fff' : 'rgba(255,255,255,0.45)', marginBottom:3, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{s.title}</div>
                        <div style={{ fontSize:10, color:'rgba(255,255,255,0.22)' }}>
                          {s.messages.filter(m => m.role === 'user').length} msg · {timeAgoChat(s.updatedAt)}
                        </div>
                      </div>
                      <button onClick={e => { e.stopPropagation(); setConfirmDeleteId(s.id) }}
                        className="chat-history-delete"
                        style={{ width:24, height:24, borderRadius:7, border:'none', background:'transparent', color:'rgba(255,255,255,0.15)', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, transition:'all 0.15s', opacity:0 }}
                        onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color='#f87171'; (e.currentTarget as HTMLButtonElement).style.background='rgba(239,68,68,0.12)'; (e.currentTarget as HTMLButtonElement).style.opacity='1' }}
                        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color='rgba(255,255,255,0.15)'; (e.currentTarget as HTMLButtonElement).style.background='transparent' }}
                      >
                        <svg width="11" height="11" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

        </div>{/* end left col */}

        {/* RIGHT COLUMN */}
        <div className="xo-bento-col xo-bento-col--right">

          {/* Card 3 - Messages */}
          <div className="xo-bento-card xo-bento-card--messages">
            {messages.length === 0 && !loading && (
              <div style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:18, animation:'fadeIn 0.5s ease' }}>
                {/* Hero logo */}
                <div style={{
                  width:64, height:64, borderRadius:20,
                  background:'linear-gradient(145deg, rgba(235,177,89,0.18), rgba(238,111,83,0.09))',
                  border:'1px solid rgba(235,177,89,0.22)',
                  display:'flex', alignItems:'center', justifyContent:'center',
                  boxShadow:'0 0 40px rgba(235,177,89,0.15), inset 0 1px 0 rgba(255,255,255,0.08)',
                }}>
                  <span style={{ fontFamily:'"Syne", sans-serif', fontSize:22, fontWeight:800, color:'#EBB159', letterSpacing:'-0.04em', textShadow:'0 0 16px rgba(235,177,89,0.8)' }}>XO</span>
                </div>
                <div style={{ textAlign:'center' }}>
                  <div style={{ fontSize:18, fontWeight:700, color:'#fff', marginBottom:8, letterSpacing:'-0.02em' }}>How can I help?</div>
                  <div style={{ fontSize:13, color:'rgba(255,255,255,0.3)', lineHeight:1.75, maxWidth:300 }}>
                    Ask me anything — code, analysis, notes, or just a question.
                  </div>
                </div>
                <div style={{ display:'flex', gap:8, flexWrap:'wrap', justifyContent:'center' }}>
                  {['Summarise my notes', 'Debug this code', 'Explain a concept'].map(s => (
                    <button key={s}
                      onClick={() => { if (inputRef.current) { inputRef.current.innerText = s; setInput(s); inputRef.current.focus() } }}
                      style={{
                        padding:'7px 16px', borderRadius:99,
                        border:'1px solid rgba(255,255,255,0.09)',
                        background:'rgba(255,255,255,0.03)', color:'rgba(255,255,255,0.45)',
                        fontSize:12, fontWeight:500, cursor:'pointer', transition:'all 0.18s',
                      }}
                      onMouseEnter={e => { const b = e.currentTarget as HTMLButtonElement; b.style.background='rgba(235,177,89,0.08)'; b.style.color='rgba(255,255,255,0.9)'; b.style.borderColor='rgba(235,177,89,0.22)' }}
                      onMouseLeave={e => { const b = e.currentTarget as HTMLButtonElement; b.style.background='rgba(255,255,255,0.03)'; b.style.color='rgba(255,255,255,0.45)'; b.style.borderColor='rgba(255,255,255,0.09)' }}
                    >{s}</button>
                  ))}
                </div>
              </div>
            )}

            {/* Message feed */}
            <div className="web-scroll" style={{ flex:1, display:'flex', flexDirection:'column', gap:20, paddingRight:6 }}>
              {messages.map((msg, idx) => {
                const isUser = msg.role === 'user'
                const prevRole = idx > 0 ? messages[idx - 1].role : null
                const groupTop = prevRole === msg.role
                return (
                  <div key={msg.id} className="fade-in" style={{
                    display:'flex', justifyContent: isUser ? 'flex-end' : 'flex-start',
                    alignItems:'flex-start', gap:10,
                    marginTop: groupTop ? -8 : 0,
                  }}>
                    {!isUser && (
                      <div style={{ flexShrink:0, marginTop:2, visibility: groupTop ? 'hidden' : 'visible' }}>
                        <div style={{
                          width:32, height:32, borderRadius:11,
                          background:'linear-gradient(145deg, rgba(235,177,89,0.2), rgba(238,111,83,0.1))',
                          border:'1px solid rgba(235,177,89,0.25)',
                          display:'flex', alignItems:'center', justifyContent:'center',
                          boxShadow:'0 0 16px rgba(235,177,89,0.12)',
                        }}>
                          <span style={{ fontSize:9, fontWeight:900, color:'#EBB159', fontFamily:'"Syne", sans-serif', textShadow:'0 0 8px rgba(235,177,89,0.6)' }}>XO</span>
                        </div>
                      </div>
                    )}
                    <div style={{ maxWidth:'76%', display:'flex', flexDirection:'column', gap:4, alignItems: isUser ? 'flex-end' : 'flex-start' }}>
                      <div className={isUser ? 'web-msg-user' : 'web-msg-ai'}>{msg.content}</div>
                      <div style={{ fontSize:10, color:'rgba(255,255,255,0.2)', paddingLeft: isUser ? 0 : 4, paddingRight: isUser ? 4 : 0 }}>
                        {new Date(msg.timestamp).toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' })}
                      </div>
                    </div>
                  </div>
                )
              })}

              {/* Tool indicator */}
              {activeTools.length > 0 && (
                <div className="fade-in" style={{ display:'flex', alignItems:'center', gap:10 }}>
                  <div style={{ width:32, height:32, borderRadius:11, background:'linear-gradient(145deg, rgba(235,177,89,0.2), rgba(238,111,83,0.1))', border:'1px solid rgba(235,177,89,0.25)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, boxShadow:'0 0 16px rgba(235,177,89,0.12)' }}>
                    <span style={{ fontSize:9, fontWeight:900, color:'#EBB159', fontFamily:'"Syne", sans-serif' }}>XO</span>
                  </div>
                  <div style={{ display:'flex', alignItems:'center', gap:9, padding:'9px 15px', borderRadius:14, background:'rgba(235,177,89,0.07)', border:'1px solid rgba(235,177,89,0.18)', boxShadow:'0 0 20px rgba(235,177,89,0.07)' }}>
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="rgba(235,177,89,0.8)" style={{ animation:'spin 1s linear infinite', flexShrink:0 }}>
                      <path strokeLinecap="round" strokeWidth={2.5} d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                    </svg>
                    <span style={{ fontSize:12, color:'rgba(235,177,89,0.85)', fontWeight:500 }}>{activeTools[activeTools.length - 1].replace(/_/g,' ')}...</span>
                  </div>
                </div>
              )}

              {/* Typing indicator */}
              {loading && activeTools.length === 0 && (
                <div className="fade-in" style={{ display:'flex', alignItems:'flex-start', gap:10 }}>
                  <div style={{ width:32, height:32, borderRadius:11, background:'linear-gradient(145deg, rgba(235,177,89,0.2), rgba(238,111,83,0.1))', border:'1px solid rgba(235,177,89,0.25)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, boxShadow:'0 0 16px rgba(235,177,89,0.12)' }}>
                    <span style={{ fontSize:9, fontWeight:900, color:'#EBB159', fontFamily:'"Syne", sans-serif' }}>XO</span>
                  </div>
                  <div style={{ display:'flex', gap:5, alignItems:'center', padding:'12px 16px', borderRadius:'5px 16px 16px 16px', background:'rgba(255,255,255,0.045)', border:'1px solid rgba(255,255,255,0.08)', marginTop:2 }}>
                    {[0, 160, 320].map(d => (
                      <span key={d} style={{ width:6, height:6, borderRadius:'50%', background:'rgba(235,177,89,0.6)', display:'inline-block', animation:`fadeIn 0.7s ${d}ms ease-in-out infinite alternate` }} />
                    ))}
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>
          </div>

          {/* Card 4 - Input */}
          <div className="xo-bento-card xo-bento-card--input">
            <div className="xo-input-pill"
              onFocusCapture={e => { (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(235,177,89,0.4)' }}
              onBlurCapture={e => { (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(255,255,255,0.08)' }}
            >
              <div
                ref={inputRef}
                contentEditable
                suppressContentEditableWarning
                className="web-chat-input"
                data-placeholder="Ask anything..."
                onInput={e => setInput((e.currentTarget as HTMLDivElement).innerText)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    const el = e.currentTarget as HTMLDivElement
                    const text = el.innerText.trim()
                    if (!text || loading) return
                    el.innerText = ''
                    setInput('')
                    handleSend(text)
                  }
                }}
                style={{
                  flex:1, outline:'none', color:'#fff',
                  fontSize:14, lineHeight:'22px',
                  overflowY:'auto', wordBreak:'break-word',
                  maxHeight:130, fontFamily:'inherit',
                  cursor:'text', whiteSpace:'pre-wrap', minHeight:22,
                }}
              />
              <button
                onClick={() => {
                  const el = inputRef.current
                  const text = el?.innerText?.trim() ?? input.trim()
                  if (!text || loading) return
                  if (el) el.innerText = ''
                  setInput('')
                  handleSend(text)
                }}
                disabled={!input.trim() || loading}
                style={{
                  width:38, height:38, borderRadius:12, border:'none', flexShrink:0,
                  background: input.trim() && !loading
                    ? 'linear-gradient(145deg, #EBB159, #EE6F53)'
                    : 'rgba(255,255,255,0.07)',
                  cursor: input.trim() && !loading ? 'pointer' : 'default',
                  display:'flex', alignItems:'center', justifyContent:'center',
                  color: input.trim() && !loading ? '#fff' : 'rgba(255,255,255,0.22)',
                  transition:'all 0.18s',
                  boxShadow: input.trim() && !loading
                    ? '0 4px 20px rgba(238,111,83,0.45), inset 0 1px 0 rgba(255,255,255,0.15)'
                    : 'none',
                }}
              >
                {loading
                  ? <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" style={{ animation:'spin 1s linear infinite' }}>
                      <path strokeLinecap="round" strokeWidth={2.5} d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4" />
                    </svg>
                  : <svg width="14" height="14" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
                    </svg>
                }
              </button>
            </div>
            <div style={{ marginTop:9, display:'flex', alignItems:'center', justifyContent:'space-between', paddingLeft:2 }}>
              <span style={{ fontSize:11, color:'rgba(255,255,255,0.2)' }}>Enter to send · Shift+Enter for newline</span>
              {input.trim() && (
                <span style={{ fontSize:11, color:'rgba(235,177,89,0.55)', fontWeight:600 }}>
                  {input.trim().split(/\s+/).filter(Boolean).length}w
                </span>
              )}
            </div>
          </div>

        </div>{/* end right col */}

      </div>
    </>
  )
}


/* -- Web Notes Panel -------------------------------------------------------- */
function WebNotesPanel({ onNoteChange }: { onNoteChange?: (note: Note | null) => void }) {
  return (
    <div className="web-panel-main">
      <WebNotesInner onNoteChange={onNoteChange} />
    </div>
  )
}

import { useState as useStateN, useRef as useRefN, useEffect as useEffectN, useCallback as useCallbackN } from 'react'

const STORAGE_KEY = 'xo-notes'
const NOTE_COLORS = [
  { bg: 'rgba(255,255,255,0.0)',  dot: 'rgba(255,255,255,0.45)' },
  { bg: 'rgba(235,177,89,0.12)',  dot: 'rgba(235,177,89,0.9)'   },
  { bg: 'rgba(238,111,83,0.12)',  dot: 'rgba(238,111,83,0.9)'   },
  { bg: 'rgba(139,92,246,0.12)',  dot: 'rgba(139,92,246,0.9)'   },
  { bg: 'rgba(59,130,246,0.12)',  dot: 'rgba(59,130,246,0.9)'   },
  { bg: 'rgba(16,185,129,0.12)',  dot: 'rgba(16,185,129,0.9)'   },
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

function WebNotesInner({ onNoteChange }: { onNoteChange?: (note: Note | null) => void }) {
  const [notes, setNotes] = useStateN<Note[]>(() => { const l = loadNotes(); return l.length ? l : [newNoteObj()] })
  const [activeId, setActiveId] = useStateN<string>(() => { const l = loadNotes(); return l.length ? l[0].id : '' })
  const [confirmDeleteId, setConfirmDeleteId] = useStateN<string | null>(null)
  const titleRef = useRefN<HTMLInputElement>(null)

  useEffectN(() => { saveNotesLocal(notes) }, [notes])

  useEffectN(() => {
    function handleNotesUpdated() {
      const fresh = loadNotes()
      setNotes(fresh.length ? fresh : [newNoteObj()])
      setActiveId(prev => fresh.some(n => n.id === prev) ? prev : (fresh[0]?.id ?? ''))
    }
    window.addEventListener('xo-notes-updated', handleNotesUpdated)
    return () => window.removeEventListener('xo-notes-updated', handleNotesUpdated)
  }, [])

  useEffectN(() => {
    function handleFocusNote(e: Event) {
      const id = (e as CustomEvent<{ id: string }>).detail?.id
      if (id) setActiveId(id)
    }
    window.addEventListener('xo-focus-note', handleFocusNote)
    return () => window.removeEventListener('xo-focus-note', handleFocusNote)
  }, [])

  const activeNote = notes.find(n => n.id === activeId) ?? notes[0]
  const activeColor = activeNote ? colorFromBg(activeNote.color) : NOTE_COLORS[0]
  const wordCount = activeNote ? activeNote.content.trim().split(/\s+/).filter(Boolean).length : 0
  const charCount = activeNote ? activeNote.content.length : 0

  // Pinned notes always sort to top
  const sortedNotes = [...notes].sort((a, b) => {
    if (a.pinned && !b.pinned) return -1
    if (!a.pinned && b.pinned) return 1
    return b.updatedAt - a.updatedAt
  })

  useEffectN(() => { onNoteChange?.(activeNote ?? null) }, [activeNote, onNoteChange])

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
    <div className="xo-bento-chat">

      {/* LEFT COLUMN */}
      <div className="xo-bento-col xo-bento-col--left">

        {/* Card 1 - Notes brand header */}
        <div className="xo-bento-card xo-bento-card--brand">
          {/* glow */}
          <div style={{ position:'absolute', inset:0, borderRadius:'inherit', overflow:'hidden', pointerEvents:'none' }}>
            <div style={{ position:'absolute', width:200, height:200, borderRadius:'50%', background:'radial-gradient(circle, rgba(235,177,89,0.2) 0%, transparent 65%)', top:-70, right:-50, filter:'blur(22px)' }} />
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:12, position:'relative' }}>
            <div style={{
              width:46, height:46, borderRadius:15, flexShrink:0,
              background:'linear-gradient(145deg, rgba(235,177,89,0.25), rgba(238,111,83,0.12))',
              border:'1px solid rgba(235,177,89,0.32)',
              display:'flex', alignItems:'center', justifyContent:'center',
              boxShadow:'0 0 22px rgba(235,177,89,0.18), inset 0 1px 0 rgba(255,255,255,0.1)',
            }}>
              <svg width="18" height="18" fill="none" stroke="#EBB159" viewBox="0 0 24 24" style={{ filter:'drop-shadow(0 0 6px rgba(235,177,89,0.7))' }}>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
                  d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </div>
            <div>
              <div style={{ fontSize:15, fontWeight:700, color:'#fff', letterSpacing:'-0.02em' }}>Notes</div>
              <div style={{ display:'flex', alignItems:'center', gap:6, marginTop:3 }}>
                <div className="status-dot" />
                <span style={{ fontSize:11, color:'rgba(255,255,255,0.32)', fontWeight:500 }}>{notes.length} note{notes.length !== 1 ? 's' : ''}</span>
              </div>
            </div>
            <button
              onClick={addNote}
              style={{
                marginLeft:'auto', height:30, padding:'0 14px', borderRadius:9,
                border:'1px solid rgba(235,177,89,0.22)',
                background:'rgba(235,177,89,0.09)', color:'#EBB159',
                cursor:'pointer', display:'flex', alignItems:'center', gap:5,
                fontSize:11, fontWeight:700, transition:'all 0.15s',
                boxShadow:'0 0 12px rgba(235,177,89,0.08)',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background='rgba(235,177,89,0.18)'; (e.currentTarget as HTMLButtonElement).style.boxShadow='0 0 20px rgba(235,177,89,0.18)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background='rgba(235,177,89,0.09)'; (e.currentTarget as HTMLButtonElement).style.boxShadow='0 0 12px rgba(235,177,89,0.08)' }}
            >
              <svg width="9" height="9" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 4v16m8-8H4" />
              </svg>
              New
            </button>
          </div>
        </div>

        {/* Card 2 - Notes list */}
        <div className="xo-bento-card xo-bento-card--sessions">
          <div style={{ fontSize:10, fontWeight:700, color:'rgba(255,255,255,0.25)', letterSpacing:'0.1em', textTransform:'uppercase', marginBottom:10, flexShrink:0 }}>All Notes</div>
          <div className="web-scroll xo-sessions-list">
            {sortedNotes.map(n => {
              const nc = colorFromBg(n.color)
              const isActive = n.id === activeId
              return (
                <div key={n.id} style={{ position:'relative' }}>
                  {confirmDeleteId === n.id ? (
                    <div style={{ padding:'10px 12px', borderRadius:12, marginBottom:4, background:'rgba(239,68,68,0.07)', border:'1px solid rgba(239,68,68,0.2)', display:'flex', alignItems:'center', gap:8 }}>
                      <span style={{ fontSize:11, color:'rgba(255,255,255,0.4)', flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>Delete?</span>
                      <button onClick={() => deleteNote(n.id)} style={{ fontSize:11, fontWeight:700, color:'#f87171', background:'rgba(239,68,68,0.16)', border:'1px solid rgba(239,68,68,0.28)', borderRadius:6, padding:'3px 10px', cursor:'pointer' }}>Yes</button>
                      <button onClick={() => setConfirmDeleteId(null)} style={{ fontSize:11, color:'rgba(255,255,255,0.35)', background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.1)', borderRadius:6, padding:'3px 10px', cursor:'pointer' }}>No</button>
                    </div>
                  ) : (
                    <button
                      onClick={() => { setActiveId(n.id); setConfirmDeleteId(null) }}
                      className="xo-note-row"
                      style={{
                        width:'100%', textAlign:'left', display:'block',
                        padding:'10px 10px 10px 12px', borderRadius:12, marginBottom:4, cursor:'pointer',
                        background: isActive ? (n.color !== 'rgba(255,255,255,0.0)' ? n.color : 'rgba(235,177,89,0.08)') : 'transparent',
                        border: isActive ? `1px solid ${nc.dot.replace('0.9','0.28')}` : '1px solid transparent',
                        transition:'all 0.15s',
                        boxShadow: isActive ? `0 0 18px ${nc.dot.replace('0.9','0.08')}` : 'none',
                      }}
                      onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.04)' }}
                      onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
                    >
                      <div style={{ display:'flex', alignItems:'stretch', gap:7 }}>
                        {/* Color dot */}
                        <span style={{
                          width:7, height:7, borderRadius:'50%', flexShrink:0, marginTop:5,
                          background: nc.dot,
                          boxShadow: isActive ? `0 0 6px ${nc.dot.replace('0.9','0.7')}` : 'none',
                        }} />
                        {/* Main content */}
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                            <span style={{ fontSize:12, fontWeight: isActive ? 600 : 400, color: isActive ? '#fff' : 'rgba(255,255,255,0.5)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', flex:1 }}>
                              {n.title || 'Untitled'}
                            </span>
                          </div>
                          <div style={{ fontSize:11, color:'rgba(255,255,255,0.25)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', marginTop:4 }}>
                            {n.content ? n.content.slice(0, 38) : 'Empty note'}
                          </div>
                          <div style={{ fontSize:10, color:'rgba(255,255,255,0.18)', marginTop:3 }}>{timeAgo(n.updatedAt)}</div>
                        </div>
                        {/* Actions column — pin always visible if pinned, trash only on hover */}
                        <div style={{ display:'flex', flexDirection:'column', gap:2, flexShrink:0 }}>
                          {/* Pin */}
                          <span
                            onClick={e => { e.stopPropagation(); updateNote(n.id, { pinned: !n.pinned }) }}
                            className="xo-note-actions"
                            style={{
                              width:24, height:24, borderRadius:7,
                              display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer',
                              color: n.pinned ? '#fff' : 'rgba(255,255,255,0.3)',
                              background: n.pinned ? 'rgba(235,177,89,0.18)' : 'transparent',
                              opacity: n.pinned ? 1 : 0,
                              transition:'all 0.2s',
                            }}
                            onMouseEnter={e => { (e.currentTarget as HTMLSpanElement).style.background='rgba(235,177,89,0.25)'; (e.currentTarget as HTMLSpanElement).style.color='#fff' }}
                            onMouseLeave={e => { (e.currentTarget as HTMLSpanElement).style.background= n.pinned ? 'rgba(235,177,89,0.18)' : 'transparent'; (e.currentTarget as HTMLSpanElement).style.color= n.pinned ? '#fff' : 'rgba(255,255,255,0.3)' }}
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                              style={{ transform: n.pinned ? 'rotate(-30deg)' : 'rotate(0deg)', transition:'transform 0.2s' }}
                            >
                              <path d="M12 17v5"/>
                              <path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"/>
                            </svg>
                          </span>
                          {/* Trash — only on hover */}
                          <span
                            onClick={e => { e.stopPropagation(); setConfirmDeleteId(n.id) }}
                            className="xo-note-trash"
                            style={{
                              width:24, height:24, borderRadius:7,
                              display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer',
                              color:'rgba(255,255,255,0.3)', background:'transparent',
                              opacity: 0,
                              transition:'all 0.15s',
                            }}
                            onMouseEnter={e => { (e.currentTarget as HTMLSpanElement).style.color='#f87171'; (e.currentTarget as HTMLSpanElement).style.background='rgba(239,68,68,0.12)' }}
                            onMouseLeave={e => { (e.currentTarget as HTMLSpanElement).style.color='rgba(255,255,255,0.3)'; (e.currentTarget as HTMLSpanElement).style.background='transparent' }}
                          >
                            <svg width="13" height="13" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </span>
                        </div>
                      </div>
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        </div>

      </div>{/* end left col */}

      {/* RIGHT COLUMN - Editor */}
      <div className="xo-bento-col xo-bento-col--right">
        {activeNote ? (
          <div className="xo-bento-card xo-notes-editor"
            style={{
              background: activeColor.bg !== 'rgba(255,255,255,0.0)'
                ? `linear-gradient(160deg, ${activeColor.bg} 0%, rgba(14,10,6,0.85) 60%)`
                : 'rgba(14,10,6,0.72)',
              transition:'background 0.4s ease',
            }}
          >
            {/* Color glow based on active note */}
            {activeColor.bg !== 'rgba(255,255,255,0.0)' && (
              <div style={{ position:'absolute', inset:0, borderRadius:'inherit', overflow:'hidden', pointerEvents:'none' }}>
                <div style={{ position:'absolute', width:300, height:300, borderRadius:'50%', background:`radial-gradient(circle, ${activeColor.dot.replace('0.9','0.12')} 0%, transparent 65%)`, top:-80, right:-60, filter:'blur(30px)' }} />
              </div>
            )}

            {/* Toolbar */}
            <div style={{
              display:'flex', alignItems:'center', gap:10, padding:'16px 22px 14px',
              borderBottom:'1px solid rgba(255,255,255,0.06)', flexShrink:0, position:'relative',
            }}>
              {/* Color swatches */}
              <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                {NOTE_COLORS.map(c => (
                  <button key={c.bg} onClick={() => updateNote(activeNote.id, { color: c.bg })}
                    style={{
                      width:13, height:13, borderRadius:'50%', padding:0, cursor:'pointer',
                      border: activeNote.color === c.bg ? `2px solid ${c.dot}` : '2px solid transparent',
                      background: c.dot,
                      transform: activeNote.color === c.bg ? 'scale(1.35)' : 'scale(1)',
                      transition:'transform 0.15s, border 0.15s',
                      boxShadow: activeNote.color === c.bg ? `0 0 8px ${c.dot.replace('0.9','0.6')}` : 'none',
                    }}
                  />
                ))}
              </div>
              <div style={{ flex:1 }} />
              {/* Stats */}
              <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                <span style={{ fontSize:11, color:'rgba(255,255,255,0.25)', fontWeight:500 }}>{wordCount}w · {charCount}c</span>
                <span style={{ fontSize:11, color:'rgba(255,255,255,0.2)' }}>{timeAgo(activeNote.updatedAt)}</span>
              </div>
            </div>

            {/* Title */}
            <input
              ref={titleRef}
              value={activeNote.title}
              onChange={e => updateNote(activeNote.id, { title: e.target.value })}
              placeholder="Untitled"
              style={{
                flexShrink:0, background:'transparent', border:'none', outline:'none',
                color:'#fff', fontSize:24, fontWeight:700, letterSpacing:'-0.03em',
                padding:'22px 24px 10px', fontFamily:'inherit', width:'100%',
              }}
            />
            {/* Subtle rule */}
            <div style={{ margin:'0 24px 4px', height:1, background:`linear-gradient(90deg, ${activeColor.dot.replace('0.9','0.2')}, transparent)`, flexShrink:0 }} />

            {/* Body */}
            <textarea
              value={activeNote.content}
              onChange={e => updateNote(activeNote.id, { content: e.target.value })}
              placeholder="Start writing..."
              className="web-scroll xo-notes-textarea"
              style={{
                flex:1, background:'transparent', border:'none', outline:'none', resize:'none',
                color:'rgba(255,255,255,0.75)', fontSize:14, lineHeight:1.85,
                padding:'14px 24px 24px', fontFamily:'inherit',
              }}
            />
          </div>
        ) : (
          <div className="xo-bento-card" style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', flexDirection:'column', gap:12, color:'rgba(255,255,255,0.2)' }}>
            <svg width="28" height="28" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ opacity:0.4 }}>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
            <span style={{ fontSize:13 }}>Select a note to edit</span>
          </div>
        )}
      </div>{/* end right col */}

    </div>
  )
}

/* â”€â”€ Web Video Captions panel â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
import { processVideoFile, processVideoURL } from './gemini'
import type { CaptionTone, CaptionResults } from './gemini'
import type { CaptionHistoryEntry } from './types'
import { loadCaptionHistory, addCaptionHistoryEntry, deleteCaptionHistoryEntry, clearCaptionHistory } from './captionHistory'

// Tone definitions "” SVG icons matching the overlay exactly
const VIDEO_TONES: { id: CaptionTone; label: string; icon: React.ReactElement; accent: string; border: string; dot: string }[] = [
  {
    id: 'formal', label: 'Formal', dot: 'rgba(59,130,246,0.9)', accent: 'rgba(59,130,246,0.12)', border: 'rgba(59,130,246,0.25)',
    icon: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="14" rx="2" /><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" /><line x1="12" y1="12" x2="12" y2="16" /><line x1="10" y1="14" x2="14" y2="14" /></svg>,
  },
  {
    id: 'sarcastic', label: 'Sarcastic', dot: 'rgba(239,68,68,0.9)', accent: 'rgba(239,68,68,0.12)', border: 'rgba(239,68,68,0.25)',
    icon: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M8 15s1.5 2 4 2 4-2 4-2" /><circle cx="9" cy="10" r="1" fill="currentColor" /><circle cx="15" cy="10" r="1" fill="currentColor" /><path d="M8 8.5c.5-1 1.5-1.5 2.5-1" strokeWidth={1.5} /><path d="M16 8.5c-.5-1-1.5-1.5-2.5-1" strokeWidth={1.5} /></svg>,
  },
  {
    id: 'humorous-tech', label: 'Humorous Tech', dot: 'rgba(139,92,246,0.9)', accent: 'rgba(139,92,246,0.12)', border: 'rgba(139,92,246,0.25)',
    icon: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><polyline points="16 18 22 12 16 6" /><polyline points="8 6 2 12 8 18" /><line x1="12" y1="4" x2="12" y2="20" opacity={0.4} strokeWidth={1.5} /></svg>,
  },
  {
    id: 'humorous-nontech', label: 'Humorous Non-Tech', dot: 'rgba(245,158,11,0.9)', accent: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.25)',
    icon: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M8 13s1.5 3 4 3 4-3 4-3" /><line x1="9" y1="9" x2="9.01" y2="9" strokeWidth={3} strokeLinecap="round" /><line x1="15" y1="9" x2="15.01" y2="9" strokeWidth={3} strokeLinecap="round" /></svg>,
  },
]

const TONE_NOTE_COLORS: Record<CaptionTone, string> = {
  formal:              'rgba(59,130,246,0.14)',
  sarcastic:           'rgba(239,68,68,0.14)',
  'humorous-tech':     'rgba(139,92,246,0.14)',
  'humorous-nontech':  'rgba(245,158,11,0.14)',
}

function VSpinner() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
      style={{ animation: 'vs-spin 0.8s linear infinite', flexShrink: 0, display: 'inline-block' }}>
      <path strokeLinecap="round" d="M12 2a10 10 0 0 1 10 10" opacity={0.9} />
      <path strokeLinecap="round" d="M12 2a10 10 0 0 0-10 10" opacity={0.3} />
    </svg>
  )
}

function WebVideoPanel() {
  const [inputMode, setInputMode] = useState<'file' | 'url'>('file')
  const [videoFile, setVideoFile] = useState<File | null>(null)
  const [videoURL, setVideoURL] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const [status, setStatus] = useState<'idle' | 'processing' | 'done' | 'error'>('idle')
  const [processingTone, setProcessingTone] = useState<CaptionTone | null>(null)
  const [uploadPhase, setUploadPhase] = useState<'uploading' | 'processing' | null>(null)
  const [uploadPct, setUploadPct] = useState<number>(0)
  const [errorMsg, setErrorMsg] = useState('')
  const [results, setResults] = useState<CaptionResults | null>(null)
  const [activeTone, setActiveTone] = useState<CaptionTone>('formal')
  const [savedToNotes, setSavedToNotes] = useState(false)
  const [currentLabel, setCurrentLabel] = useState('')
  const [history, setHistory] = useState<CaptionHistoryEntry[]>(() => loadCaptionHistory())
  const fileInputRef = useRef<HTMLInputElement>(null)

  function handleFile(file: File) {
    if (!file.type.startsWith('video/')) { setErrorMsg('Please upload a video file.'); setStatus('error'); return }
    setVideoFile(file); setStatus('idle'); setErrorMsg(''); setResults(null); setSavedToNotes(false)
  }

  async function handleProcess() {
    setStatus('processing'); setResults(null); setErrorMsg(''); setSavedToNotes(false)
    setUploadPhase(null); setUploadPct(0)
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
      } else { throw new Error('No video source provided.') }
      setResults(res); setStatus('done'); setProcessingTone(null)
      setUploadPhase(null); setCurrentLabel(label)
      const updated = addCaptionHistoryEntry({ label, results: res as unknown as Record<string, never> })
      setHistory(updated)
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Something went wrong.')
      setStatus('error'); setProcessingTone(null); setUploadPhase(null)
    }
  }

  function handleLoadFromHistory(entry: CaptionHistoryEntry) {
    setResults(entry.results as unknown as CaptionResults)
    setCurrentLabel(entry.label)
    setStatus('done')
    setActiveTone('formal')
    setSavedToNotes(false)
  }

  function handleClearHistory() {
    clearCaptionHistory()
    setHistory([])
  }

  function saveAllToNotes() {
    if (!results) return
    const existing: Note[] = (() => { try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') } catch { return [] } })()
    const label = currentLabel || (videoFile ? videoFile.name : videoURL.trim())
    const ts = new Date().toLocaleString()
    const newNotes: Note[] = VIDEO_TONES.map(t => {
      const r = results[t.id]
      const content = `[Video] ${label}\n[Generated] ${ts}\n\n-- Summary --\n${r.summary}`
      const now = Date.now()
      return { id: now.toString() + Math.random().toString(36).slice(2), title: `[${t.label}] ${label}`, content, color: TONE_NOTE_COLORS[t.id], createdAt: now, updatedAt: now }
    })
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...newNotes, ...existing]))
    window.dispatchEvent(new CustomEvent('xo-notes-updated'))
    setSavedToNotes(true)
  }

  const canProcess = status !== 'processing' && (inputMode === 'file' ? !!videoFile : videoURL.trim().length > 5)
  const activeToneData = VIDEO_TONES.find(t => t.id === activeTone)!
  const activeResult = results?.[activeTone]

  return (
    <div className="xo-bento-chat" style={{ padding: 0 }}>
      <style>{`@keyframes vs-spin { to { transform: rotate(360deg); } }`}</style>

      {/* LEFT COLUMN */}
      <div className="xo-bento-col xo-bento-col--left">

        {/* Card 1 — Brand */}
        <div className="xo-bento-card xo-bento-card--brand" style={{ background:'rgba(238,111,83,0.05)', borderColor:'rgba(238,111,83,0.18)' }}>
          <div style={{ position:'absolute', inset:0, borderRadius:'inherit', overflow:'hidden', pointerEvents:'none' }}>
            <div style={{ position:'absolute', width:200, height:200, borderRadius:'50%', background:'radial-gradient(circle, rgba(238,111,83,0.22) 0%, transparent 65%)', top:-70, right:-50, filter:'blur(22px)' }} />
            <div style={{ position:'absolute', width:120, height:120, borderRadius:'50%', background:'radial-gradient(circle, rgba(235,177,89,0.1) 0%, transparent 70%)', bottom:-30, left:-20, filter:'blur(16px)' }} />
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:18, position:'relative' }}>
            <div style={{ width:46, height:46, borderRadius:15, flexShrink:0, background:'linear-gradient(145deg, rgba(238,111,83,0.28), rgba(235,177,89,0.14))', border:'1px solid rgba(238,111,83,0.35)', display:'flex', alignItems:'center', justifyContent:'center', boxShadow:'0 0 24px rgba(238,111,83,0.2), inset 0 1px 0 rgba(255,255,255,0.12)' }}>
              <svg width="18" height="18" fill="none" stroke="rgba(238,111,83,0.95)" viewBox="0 0 24 24" style={{ filter:'drop-shadow(0 0 6px rgba(238,111,83,0.7))' }}>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 10l4.553-2.276A1 1 0 0121 8.723v6.554a1 1 0 01-1.447.894L15 14M4 8a2 2 0 012-2h9a2 2 0 012 2v8a2 2 0 01-2 2H6a2 2 0 01-2-2V8z" />
              </svg>
            </div>
            <div>
              <div style={{ fontSize:15, fontWeight:700, color:'#fff', letterSpacing:'-0.02em', lineHeight:1.2 }}>Video Summarizer</div>
              <div style={{ display:'flex', alignItems:'center', gap:6, marginTop:3 }}>
                <div style={{ width:7, height:7, borderRadius:'50%', background:'rgba(238,111,83,0.85)', flexShrink:0 }} />
                <span style={{ fontSize:11, color:'rgba(255,255,255,0.32)', fontWeight:500 }}>4 caption styles · AI-powered</span>
              </div>
            </div>
          </div>
          {/* Mode toggle */}
          <div style={{ position:'relative', display:'flex', gap:4, background:'rgba(255,255,255,0.06)', borderRadius:12, padding:4 }}>
            {(['file', 'url'] as const).map(m => (
              <button key={m} onClick={() => { setInputMode(m); setResults(null); setStatus('idle'); setSavedToNotes(false) }}
                style={{ flex:1, padding:'7px 0', borderRadius:9, border:'none', cursor:'pointer', fontSize:11, fontWeight:600, fontFamily:'inherit', background: inputMode === m ? 'rgba(238,111,83,0.75)' : 'transparent', color: inputMode === m ? '#fff' : 'rgba(255,255,255,0.35)', transition:'all 0.2s', display:'flex', alignItems:'center', justifyContent:'center', gap:6, boxShadow: inputMode === m ? '0 2px 12px rgba(238,111,83,0.3)' : 'none' }}>
                {m === 'file'
                  ? <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                  : <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>}
                {m === 'file' ? 'Upload File' : 'Paste URL'}
              </button>
            ))}
          </div>
        </div>

        {/* Card 2 — Drop zone / URL input */}
        <div className="xo-bento-card" style={{ padding:'18px 18px 16px', flexShrink:0 }}>
          {inputMode === 'file' ? (
            <div
              onClick={() => fileInputRef.current?.click()}
              onDragOver={e => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files?.[0]; if (f) handleFile(f) }}
              style={{ border:`1.5px dashed ${dragOver ? 'rgba(238,111,83,0.7)' : 'rgba(255,255,255,0.1)'}`, borderRadius:14, padding:'22px 16px', display:'flex', flexDirection:'column', alignItems:'center', gap:8, cursor:'pointer', transition:'all 0.15s', background: dragOver ? 'rgba(238,111,83,0.06)' : 'rgba(255,255,255,0.02)' }}
            >
              <div style={{ width:48, height:48, borderRadius:14, background: dragOver ? 'rgba(238,111,83,0.15)' : 'rgba(255,255,255,0.05)', border:`1px solid ${dragOver ? 'rgba(238,111,83,0.4)' : 'rgba(255,255,255,0.08)'}`, display:'flex', alignItems:'center', justifyContent:'center', transition:'all 0.15s', marginBottom:4 }}>
                <svg width="22" height="22" fill="none" stroke={dragOver ? 'rgba(238,111,83,0.9)' : 'rgba(255,255,255,0.3)'} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.723v6.554a1 1 0 01-1.447.894L15 14M4 8a2 2 0 012-2h9a2 2 0 012 2v8a2 2 0 01-2 2H6a2 2 0 01-2-2V8z" />
                </svg>
              </div>
              {videoFile ? (
                <div style={{ textAlign:'center' }}>
                  <div style={{ color:'#fff', fontSize:13, fontWeight:600, marginBottom:3 }}>{videoFile.name}</div>
                  <div style={{ color:'rgba(255,255,255,0.3)', fontSize:11 }}>
                    {(videoFile.size / (1024 * 1024)).toFixed(1)} MB
                    {' · '}
                    <span style={{ color: videoFile.size > 75 * 1024 * 1024 ? 'rgba(245,158,11,0.8)' : 'rgba(52,211,153,0.7)' }}>
                      {videoFile.size > 75 * 1024 * 1024 ? 'Files API upload' : 'Inline (fast)'}
                    </span>
                    {' · '}
                    <span style={{ color:'rgba(238,111,83,0.7)' }}>click to change</span>
                  </div>
                </div>
              ) : (
                <>
                  <div style={{ color:'rgba(255,255,255,0.55)', fontSize:12, fontWeight:600 }}>Drop a video or click to upload</div>
                  <div style={{ display:'flex', gap:4, flexWrap:'wrap', justifyContent:'center', marginTop:2 }}>
                    {['MP4','WEBM','MOV','AVI','MKV'].map(ext => (
                      <span key={ext} style={{ fontSize:9, fontWeight:700, letterSpacing:'0.06em', padding:'2px 7px', borderRadius:5, background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.1)', color:'rgba(255,255,255,0.35)' }}>{ext}</span>
                    ))}
                  </div>
                </>
              )}
              <input ref={fileInputRef} type="file" accept="video/*" onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }} style={{ display:'none' }} />
            </div>
          ) : (
            <div>
              <div style={{ fontSize:11, fontWeight:600, color:'rgba(255,255,255,0.3)', marginBottom:8, letterSpacing:'0.04em' }}>Video URL</div>
              <input type="url" value={videoURL}
                onChange={e => { setVideoURL(e.target.value); setResults(null); setStatus('idle'); setSavedToNotes(false) }}
                placeholder="https://example.com/video.mp4"
                style={{ width:'100%', boxSizing:'border-box', background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.1)', borderRadius:12, padding:'11px 14px', color:'#fff', fontSize:12, fontFamily:'inherit', outline:'none', transition:'border 0.15s' }}
                onFocus={e => { e.currentTarget.style.borderColor = 'rgba(238,111,83,0.5)' }}
                onBlur={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)' }}
              />
              <div style={{ fontSize:11, color:'rgba(255,255,255,0.22)', marginTop:8, lineHeight:1.5 }}>Direct video file URL only (must end in .mp4, .webm, etc.)</div>
            </div>
          )}
        </div>

        {/* Card 3 — Generate button + status */}
        <div className="xo-bento-card" style={{ padding:'16px 18px', flexShrink:0 }}>
          <button onClick={handleProcess} disabled={!canProcess} style={{
            width:'100%', padding:'11px 16px', borderRadius:12, border:'none',
            background: canProcess ? 'linear-gradient(135deg, #EBB159, #EE6F53)' : 'rgba(255,255,255,0.07)',
            color: canProcess ? '#fff' : 'rgba(255,255,255,0.3)',
            fontSize:13, fontWeight:700, fontFamily:'inherit', cursor: canProcess ? 'pointer' : 'not-allowed',
            display:'flex', alignItems:'center', justifyContent:'center', gap:8,
            transition:'all 0.18s', boxShadow: canProcess ? '0 4px 24px rgba(238,111,83,0.35), inset 0 1px 0 rgba(255,255,255,0.15)' : 'none',
          }}
            onMouseEnter={e => { if (canProcess) { (e.currentTarget as HTMLButtonElement).style.transform='translateY(-1px)'; (e.currentTarget as HTMLButtonElement).style.boxShadow='0 8px 32px rgba(238,111,83,0.45)' } }}
            onMouseLeave={e => { if (canProcess) { (e.currentTarget as HTMLButtonElement).style.transform=''; (e.currentTarget as HTMLButtonElement).style.boxShadow='0 4px 24px rgba(238,111,83,0.35), inset 0 1px 0 rgba(255,255,255,0.15)' } }}
          >
            {status === 'processing'
              ? <><VSpinner />{processingTone ? `Generating "${VIDEO_TONES.find(t => t.id === processingTone)?.label}"…` : 'Processing…'}</>
              : <>
                  <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                  {status === 'done' ? 'Re-generate Captions' : 'Generate Video Captions'}
                </>
            }
          </button>

          {/* Error */}
          {status === 'error' && (
            <div style={{ marginTop:10, padding:'10px 14px', borderRadius:12, background:'rgba(239,68,68,0.1)', border:'1px solid rgba(239,68,68,0.22)', color:'rgba(239,68,68,0.9)', fontSize:12, display:'flex', alignItems:'flex-start', gap:8 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink:0, marginTop:1 }}>
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17" strokeWidth={2.5}/>
              </svg>
              {errorMsg}
            </div>
          )}

          {/* Processing progress */}
          {status === 'processing' && (
            <div style={{ marginTop:12, display:'flex', flexDirection:'column', gap:6 }}>
              {uploadPhase && (
                <div style={{ padding:'8px 12px', borderRadius:10, background:'rgba(245,158,11,0.08)', border:'1px solid rgba(245,158,11,0.2)', display:'flex', flexDirection:'column', gap:5 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:7 }}>
                    <VSpinner />
                    <span style={{ fontSize:11, color:'rgba(245,158,11,0.9)', fontWeight:500 }}>
                      {uploadPhase === 'uploading' ? `Uploading… ${uploadPct}%` : 'Fireworks AI is processing your video…'}
                    </span>
                  </div>
                  {uploadPhase === 'uploading' && (
                    <div style={{ height:3, borderRadius:99, background:'rgba(255,255,255,0.07)', overflow:'hidden' }}>
                      <div style={{ height:'100%', borderRadius:99, background:'rgba(245,158,11,0.7)', width:`${uploadPct}%`, transition:'width 0.3s ease' }} />
                    </div>
                  )}
                </div>
              )}
              {VIDEO_TONES.map((t, i) => {
                const curIdx = VIDEO_TONES.findIndex(x => x.id === processingTone)
                const isDone = curIdx > i
                const isCur = t.id === processingTone
                return (
                  <div key={t.id} style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 12px', borderRadius:10, background: isCur ? t.accent : isDone ? 'rgba(16,185,129,0.07)' : 'rgba(255,255,255,0.03)', border:`1px solid ${isCur ? t.border : isDone ? 'rgba(16,185,129,0.2)' : 'rgba(255,255,255,0.06)'}`, transition:'all 0.2s' }}>
                    <span style={{ display:'flex', color: isCur ? '#fff' : isDone ? 'rgba(16,185,129,0.8)' : 'rgba(255,255,255,0.25)' }}>{t.icon}</span>
                    <span style={{ fontSize:12, color: isCur ? '#fff' : isDone ? 'rgba(16,185,129,0.8)' : 'rgba(255,255,255,0.3)', flex:1 }}>{t.label}</span>
                    {isCur ? <VSpinner /> : isDone ? <svg width="13" height="13" fill="none" stroke="rgba(16,185,129,0.8)" viewBox="0 0 24 24"><polyline strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} points="20 6 9 17 4 12"/></svg> : <div style={{ width:8, height:8, borderRadius:'50%', background:'rgba(255,255,255,0.1)', border:'1px solid rgba(255,255,255,0.15)' }} />}
                  </div>
                )
              })}
            </div>
          )}

          {/* Save to notes */}
          {status === 'done' && (
            <div style={{ marginTop:10 }}>
              {!savedToNotes ? (
                <button onClick={saveAllToNotes} style={{ width:'100%', padding:'9px 16px', borderRadius:10, border:'1px solid rgba(16,185,129,0.3)', background:'rgba(16,185,129,0.09)', color:'rgba(16,185,129,0.9)', fontSize:12, fontWeight:600, fontFamily:'inherit', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:6, transition:'all 0.15s' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(16,185,129,0.18)' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(16,185,129,0.09)' }}
                >
                  <svg width="13" height="13" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                  Save all tones to Notes
                </button>
              ) : (
                <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:6, padding:'9px', color:'rgba(16,185,129,0.8)', fontSize:12, fontWeight:500 }}>
                  <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7"/></svg>
                  Saved to Notes
                </div>
              )}
            </div>
          )}
        </div>

        {/* Card 4 — History */}
        <div className="xo-bento-card xo-bento-card--sessions">
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12, flexShrink:0 }}>
            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
              <span style={{ fontSize:11, fontWeight:700, color:'rgba(255,255,255,0.4)', letterSpacing:'0.09em', textTransform:'uppercase' }}>History</span>
              <span style={{ fontSize:10, fontWeight:700, color:'rgba(255,255,255,0.35)', background:'rgba(255,255,255,0.07)', borderRadius:6, padding:'1px 7px', border:'1px solid rgba(255,255,255,0.06)' }}>{history.length}</span>
            </div>
            {history.length > 0 && (
              <button onClick={handleClearHistory} style={{ padding:'3px 10px', borderRadius:7, border:'1px solid rgba(239,68,68,0.22)', background:'rgba(239,68,68,0.07)', color:'rgba(239,68,68,0.65)', fontSize:10, fontWeight:500, fontFamily:'inherit', cursor:'pointer', transition:'all 0.15s' }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(239,68,68,0.16)' }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(239,68,68,0.07)' }}
              >Clear all</button>
            )}
          </div>
          <div className="web-scroll xo-sessions-list">
            {history.length === 0 ? (
              <div style={{ padding:'28px 8px', textAlign:'center', color:'rgba(255,255,255,0.18)', fontSize:12, lineHeight:1.6 }}>
                No history yet.<br/>Generated captions will appear here.
              </div>
            ) : history.map(entry => {
              const date = new Date(entry.createdAt)
              const dateStr = date.toLocaleDateString(undefined, { month:'short', day:'numeric' })
              const timeStr = date.toLocaleTimeString(undefined, { hour:'2-digit', minute:'2-digit' })
              return (
                <div key={entry.id} style={{ padding:'10px 12px', borderRadius:12, marginBottom:4, background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.06)', display:'flex', alignItems:'center', gap:10, transition:'background 0.15s' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = 'rgba(255,255,255,0.06)' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = 'rgba(255,255,255,0.03)' }}
                >
                  <div style={{ width:32, height:32, borderRadius:10, flexShrink:0, background:'rgba(238,111,83,0.12)', border:'1px solid rgba(238,111,83,0.2)', display:'flex', alignItems:'center', justifyContent:'center' }}>
                    <svg width="14" height="14" fill="none" stroke="rgba(238,111,83,0.9)" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 10l4.553-2.276A1 1 0 0121 8.723v6.554a1 1 0 01-1.447.894L15 14M4 8a2 2 0 012-2h9a2 2 0 012 2v8a2 2 0 01-2 2H6a2 2 0 01-2-2V8z"/>
                    </svg>
                  </div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ color:'#fff', fontSize:11, fontWeight:600, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', marginBottom:3 }} title={entry.label}>{entry.label}</div>
                    <div style={{ display:'flex', gap:5, alignItems:'center', flexWrap:'wrap' }}>
                      <span style={{ color:'rgba(255,255,255,0.25)', fontSize:10 }}>{dateStr} · {timeStr}</span>
                      <div style={{ display:'flex', gap:3 }}>
                        {VIDEO_TONES.filter(t => entry.results[t.id]).map(t => (
                          <div key={t.id} title={t.label} style={{ width:5, height:5, borderRadius:99, background:t.dot, opacity:0.8 }} />
                        ))}
                      </div>
                    </div>
                  </div>
                  <button onClick={() => handleLoadFromHistory(entry)} style={{ padding:'4px 10px', borderRadius:7, border:'none', background:'rgba(238,111,83,0.18)', color:'rgba(238,111,83,0.9)', fontSize:10, fontWeight:600, fontFamily:'inherit', cursor:'pointer', transition:'all 0.15s', flexShrink:0 }}
                    onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(238,111,83,0.32)' }}
                    onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'rgba(238,111,83,0.18)' }}
                  >Load</button>
                  <button onClick={() => setHistory(deleteCaptionHistoryEntry(entry.id))} style={{ width:26, height:26, borderRadius:7, border:'none', background:'transparent', color:'rgba(255,255,255,0.2)', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', transition:'all 0.15s', flexShrink:0 }}
                    onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color='#f87171'; (e.currentTarget as HTMLButtonElement).style.background='rgba(239,68,68,0.12)' }}
                    onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color='rgba(255,255,255,0.2)'; (e.currentTarget as HTMLButtonElement).style.background='transparent' }}
                  >
                    <svg width="11" height="11" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                  </button>
                </div>
              )
            })}
          </div>
        </div>

      </div>{/* end left col */}

      {/* RIGHT COLUMN */}
      <div className="xo-bento-col xo-bento-col--right">

        {/* Card 5 — Tone selector (when done) or empty state */}
        {status === 'done' && results ? (
          <>
            {/* Tone tab bar */}
            <div className="xo-bento-card" style={{ padding:'14px 18px', flexShrink:0 }}>
              <div style={{ fontSize:10, fontWeight:700, color:'rgba(255,255,255,0.3)', letterSpacing:'0.1em', textTransform:'uppercase', marginBottom:10 }}>Caption Style</div>
              <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                {VIDEO_TONES.map(t => (
                  <button key={t.id} onClick={() => setActiveTone(t.id)} style={{
                    display:'flex', alignItems:'center', gap:6, padding:'7px 14px', borderRadius:99, border:'none', cursor:'pointer',
                    fontSize:12, fontWeight: activeTone === t.id ? 700 : 400, fontFamily:'inherit',
                    background: activeTone === t.id ? t.accent : 'rgba(255,255,255,0.04)',
                    color: activeTone === t.id ? '#fff' : 'rgba(255,255,255,0.4)',
                    boxShadow: activeTone === t.id ? `0 0 0 1.5px ${t.border}, 0 4px 16px ${t.accent}` : 'none',
                    transition:'all 0.18s',
                  }}
                    onMouseEnter={e => { if (activeTone !== t.id) (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.08)' }}
                    onMouseLeave={e => { if (activeTone !== t.id) (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.04)' }}
                  >
                    <span style={{ display:'flex', color: activeTone === t.id ? t.dot : 'inherit' }}>{t.icon}</span>
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Result card */}
            <div className="xo-bento-card xo-bento-card--messages" style={{ padding:'24px 26px' }}>
              <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:18, flexShrink:0 }}>
                <div style={{ width:36, height:36, borderRadius:11, background:activeToneData.accent, border:`1px solid ${activeToneData.border}`, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                  <span style={{ display:'flex', color:activeToneData.dot }}>{activeToneData.icon}</span>
                </div>
                <div>
                  <div style={{ fontSize:14, fontWeight:700, color:'#fff', letterSpacing:'-0.01em' }}>{activeToneData.label} Caption</div>
                  {currentLabel && <div style={{ fontSize:11, color:'rgba(255,255,255,0.3)', marginTop:2, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:380 }} title={currentLabel}>{currentLabel}</div>}
                </div>
                {/* Copy button */}
                <button
                  onClick={() => { if (activeResult?.summary) navigator.clipboard.writeText(activeResult.summary) }}
                  title="Copy to clipboard"
                  style={{ marginLeft:'auto', width:32, height:32, borderRadius:9, border:'1px solid rgba(255,255,255,0.08)', background:'rgba(255,255,255,0.04)', color:'rgba(255,255,255,0.35)', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', transition:'all 0.15s', flexShrink:0 }}
                  onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background='rgba(255,255,255,0.1)'; (e.currentTarget as HTMLButtonElement).style.color='#fff' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background='rgba(255,255,255,0.04)'; (e.currentTarget as HTMLButtonElement).style.color='rgba(255,255,255,0.35)' }}
                >
                  <svg width="13" height="13" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"/>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
                  </svg>
                </button>
              </div>
              <div className="web-scroll" style={{ flex:1, overflowY:'auto' }}>
                <div style={{ padding:'20px 22px', borderRadius:16, background:activeToneData.accent, border:`1px solid ${activeToneData.border}` }}>
                  <p style={{ color:'rgba(255,255,255,0.82)', fontSize:14, lineHeight:1.85, margin:0, whiteSpace:'pre-wrap', wordBreak:'break-word' }}>
                    {activeResult?.summary || 'No summary generated.'}
                  </p>
                </div>
                {/* All-tones compact view */}
                <div style={{ marginTop:16, display:'flex', flexDirection:'column', gap:8 }}>
                  <div style={{ fontSize:10, fontWeight:700, color:'rgba(255,255,255,0.25)', letterSpacing:'0.1em', textTransform:'uppercase', marginBottom:4 }}>Other Styles</div>
                  {VIDEO_TONES.filter(t => t.id !== activeTone).map(t => {
                    const r = results[t.id]
                    return r ? (
                      <button key={t.id} onClick={() => setActiveTone(t.id)} style={{ textAlign:'left', padding:'12px 14px', borderRadius:12, border:`1px solid ${t.border}`, background:t.accent, cursor:'pointer', transition:'all 0.15s', display:'flex', alignItems:'flex-start', gap:10 }}
                        onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.opacity='0.85' }}
                        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.opacity='1' }}
                      >
                        <span style={{ display:'flex', color:t.dot, flexShrink:0, marginTop:1 }}>{t.icon}</span>
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ fontSize:11, fontWeight:700, color:'rgba(255,255,255,0.6)', marginBottom:4 }}>{t.label}</div>
                          <div style={{ fontSize:12, color:'rgba(255,255,255,0.45)', lineHeight:1.6, overflow:'hidden', display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical' as const }}>
                            {r.summary}
                          </div>
                        </div>
                        <svg width="12" height="12" fill="none" stroke="rgba(255,255,255,0.2)" viewBox="0 0 24 24" style={{ flexShrink:0, marginTop:2 }}>
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7"/>
                        </svg>
                      </button>
                    ) : null
                  })}
                </div>
              </div>
            </div>
          </>
        ) : (
          /* Empty state */
          <div className="xo-bento-card xo-bento-card--messages" style={{ alignItems:'center', justifyContent:'center' }}>
            <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:20, animation:'fadeIn 0.5s ease', padding:'40px 24px', textAlign:'center' }}>
              <div style={{ width:72, height:72, borderRadius:22, background:'linear-gradient(145deg, rgba(238,111,83,0.18), rgba(235,177,89,0.09))', border:'1px solid rgba(238,111,83,0.22)', display:'flex', alignItems:'center', justifyContent:'center', boxShadow:'0 0 40px rgba(238,111,83,0.15), inset 0 1px 0 rgba(255,255,255,0.08)' }}>
                <svg width="30" height="30" fill="none" stroke="rgba(238,111,83,0.8)" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.723v6.554a1 1 0 01-1.447.894L15 14M4 8a2 2 0 012-2h9a2 2 0 012 2v8a2 2 0 01-2 2H6a2 2 0 01-2-2V8z"/>
                </svg>
              </div>
              <div>
                <div style={{ fontSize:18, fontWeight:700, color:'#fff', marginBottom:10, letterSpacing:'-0.02em' }}>
                  {status === 'processing' ? 'Generating captions…' : 'Ready to summarize'}
                </div>
                <div style={{ fontSize:13, color:'rgba(255,255,255,0.3)', lineHeight:1.75, maxWidth:320 }}>
                  {status === 'processing'
                    ? 'Your video is being analyzed. Results will appear here for each caption style.'
                    : 'Upload a video file or paste a direct URL, then click Generate Video Captions.'}
                </div>
              </div>
              {status !== 'processing' && (
                <div style={{ display:'flex', gap:8, flexWrap:'wrap', justifyContent:'center' }}>
                  {VIDEO_TONES.map(t => (
                    <div key={t.id} style={{ display:'flex', alignItems:'center', gap:5, padding:'5px 12px', borderRadius:99, border:`1px solid ${t.border}`, background:t.accent }}>
                      <span style={{ display:'flex', color:t.dot }}>{t.icon}</span>
                      <span style={{ fontSize:11, color:'rgba(255,255,255,0.5)', fontWeight:500 }}>{t.label}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

      </div>{/* end right col */}

    </div>
  )
}


/* â”€â”€ Usage Tracking panel â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */

function UsageTrackingPanel() {
  const sessions = initSessions().sessions
  const totalMessages = sessions.reduce((a, s) => a + s.messages.filter(m => m.role === 'user').length, 0)
  const captionHistory = loadCaptionHistory()
  const totalTones = captionHistory.reduce((a, e) => a + Object.keys(e.results).length, 0)

  const stats = [
    { label: 'Chat Sessions',       value: sessions.length,    color: '#EBB159'  },
    { label: 'Messages Sent',        value: totalMessages,      color: '#EC9056'  },
    { label: 'Videos Summarized',   value: captionHistory.length, color: '#EE6F53' },
    { label: 'Summaries Generated', value: totalTones,            color: '#EBB159'  },
  ]

  const modelInfo = [
    { model: 'Gemma 4 E4B',    role: 'Chat (simple messages)',          badge: 'Fast'     },
    { model: 'Gemma 4 26B',    role: 'Chat with tools (notes/widgets)', badge: 'Balanced' },
    { model: 'Gemma 4 31B IT', role: 'Video summaries',      badge: 'Powerful' },
  ]

  return (
    <div className="web-panel-main" style={{ padding: '28px 32px', overflowY: 'auto' }}>
      <div style={{ maxWidth: 560 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.02em', marginBottom: 6 }}>Usage Tracking</h2>
        <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.3)', marginBottom: 32 }}>Your activity in this session.</p>

        {/* Stats grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 32 }}>
          {stats.map(s => (
            <div key={s.label} className="xo-stat-card">
              <div style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-0.04em', color: s.color, marginBottom: 4, fontFamily: '"Syne", sans-serif' }}>{s.value}</div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)' }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Models section */}
        <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 12 }}>Model Routing</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {modelInfo.map(m => (
            <div key={m.model} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 12, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#fff', marginBottom: 2, fontFamily: 'monospace' }}>{m.model}</div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>{m.role}</div>
              </div>
              <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 6, background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.5)', letterSpacing: '0.05em' }}>{m.badge}</span>
            </div>
          ))}
        </div>

        {/* Provider */}
        <div style={{ marginTop: 24, padding: '12px 14px', borderRadius: 12, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#EBB159', boxShadow: '0 0 6px rgba(235,177,89,0.6)', flexShrink: 0 }} />
          <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>All inference via <span style={{ color: '#EBB159', fontWeight: 600 }}>Fireworks AI</span> · AMD hardware</span>
        </div>
      </div>
    </div>
  )
}

/* â”€â”€ Root WebApp component â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
export default function WebApp() {
  const [activeId, setActiveId] = useState('home')
  const [activeNote, setActiveNote] = useState<Note | null>(null)

  // Build a web-native AppControl "” no Electron APIs, just localStorage + events
  const appControl: AppControl = useMemo(() => {
    const NOTES_KEY = 'xo-notes'
    function loadN(): import('./types').Note[] {
      try { return JSON.parse(localStorage.getItem(NOTES_KEY) ?? '[]') } catch { return [] }
    }
    function saveN(notes: import('./types').Note[]) {
      localStorage.setItem(NOTES_KEY, JSON.stringify(notes))
      window.dispatchEvent(new CustomEvent('xo-notes-updated'))
    }
    function makeNote(title: string, content: string): import('./types').Note {
      const now = Date.now()
      return { id: now.toString() + Math.random().toString(36).slice(2), title, content, color: 'rgba(255,255,255,0.0)', createdAt: now, updatedAt: now }
    }
    return {
      // In the web app, "open widget" = navigate to that panel
      openWidget:      (id) => setActiveId(id === 'video' ? 'video' : id === 'settings' ? 'settings' : id),
      closeWidget:     (_id) => { /* no-op in web "” can't hide panels */ },
      getOpenWidgets:  () => [activeId as import('./types').WidgetId].filter(Boolean),
      listNotes:       () => loadN(),
      getNote:         (id) => loadN().find(n => n.id === id),
      createNote:      (title, content) => {
        const n = makeNote(title, content)
        saveN([n, ...loadN()])
        return n
      },
      updateNote:      (id, patch) => {
        const notes = loadN()
        const idx = notes.findIndex(n => n.id === id)
        if (idx === -1) return null
        const updated = { ...notes[idx], ...patch, updatedAt: Date.now() }
        notes[idx] = updated
        saveN(notes)
        return updated
      },
      deleteNote:      (id) => {
        const notes = loadN()
        const next = notes.filter(n => n.id !== id)
        if (next.length === notes.length) return false
        saveN(next)
        return true
      },
      focusNote:       (id) => {
        window.dispatchEvent(new CustomEvent('xo-focus-note', { detail: { id } }))
      },
      getCaptionHistory: () => loadCaptionHistory(),
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId])

  function renderContent() {
    switch (activeId) {
      case 'chat':    return <WebChatPanel activeNote={activeNote} appControl={appControl} />
      case 'notes':   return <WebNotesPanel onNoteChange={setActiveNote} />
      case 'video':   return <WebVideoPanel />
      case 'usage':   return <UsageTrackingPanel />
      case 'settings':return <SettingsPanel />
      default:        return <HomePanel onNavigate={setActiveId} />
    }
  }

  return (
    <div className="web-shell">
      <div className="web-bg-glow-1" />
      <div className="web-bg-glow-2" />
      <main className="web-content">
        {renderContent()}
      </main>
      <Sidebar activeId={activeId} onSelect={setActiveId} />
    </div>
  )
}
