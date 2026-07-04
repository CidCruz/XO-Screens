import { useState, useEffect, useRef } from 'react'
import AppHub from './components/AppHub'
import ChatBox from './components/ChatBox'
import NotesApp from './components/NotesApp'
import DraggableWidget from './components/DraggableWidget'
import type { AppItem, Note } from './types'

const APPS: AppItem[] = [
  { id: 'chat',     label: 'Assistant'      },
  { id: 'notes',    label: 'Notes'          },
  { id: 'usage',    label: 'Usage Tracking' },
  { id: 'settings', label: 'Settings'       },
]

export default function App() {
  const [splash, setSplash] = useState(true)
  const [fadeIn, setFadeIn] = useState(false)
  const [fadeOut, setFadeOut] = useState(false)
  const [appVisible, setAppVisible] = useState(false)
  const [activeApp, setActiveApp] = useState('chat')
  const [chatOpen, setChatOpen] = useState(true)
  const [notesOpen, setNotesOpen] = useState(true)
  const [activeNote, setActiveNote] = useState<Note | null>(null)
  // 'visible' | 'entering' | 'exiting'
  const [windowAnim, setWindowAnim] = useState<'visible' | 'entering' | 'exiting'>('visible')
  const exitTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const fadeInTimer = setTimeout(() => setFadeIn(true), 50)
    const fadeOutTimer = setTimeout(() => setFadeOut(true), 3500)
    const hide = setTimeout(() => setSplash(false), 4200)
    const appFadeIn = setTimeout(() => setAppVisible(true), 4250)
    return () => { clearTimeout(fadeInTimer); clearTimeout(fadeOutTimer); clearTimeout(hide); clearTimeout(appFadeIn) }
  }, [])

  // Listen for show/hide signals from main process
  useEffect(() => {
    window.xo?.onShow(() => {
      if (exitTimer.current) clearTimeout(exitTimer.current)
      // Reset any lingering :active/:focus state from before the window was hidden
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
      document.body.focus()
      setWindowAnim('entering')
      setTimeout(() => setWindowAnim('visible'), 260)
    })
    window.xo?.onHideAnimate(() => {
      // Blur everything before animating out so state is clean on next show
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
      setWindowAnim('exiting')
      exitTimer.current = setTimeout(() => {
        window.xo?.readyToHide()
      }, 210)
    })
  }, [])

  function handleSelect(id: string) {
    setActiveApp(id)
    if (id === 'chat') setChatOpen(prev => !prev)
    if (id === 'notes') setNotesOpen(prev => !prev)
  }

  // Track which apps are currently open so the hub highlights them correctly
  const openApps = new Set([
    ...(chatOpen ? ['chat'] : []),
    ...(notesOpen ? ['notes'] : []),
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
          {(onCornerDown) => <ChatBox onClose={() => setChatOpen(false)} onCornerDown={onCornerDown} activeNote={activeNote} />}
        </DraggableWidget>
      )}

      {notesOpen && (
        <DraggableWidget initialX={Math.round(window.innerWidth - 420 - 20)} initialY={Math.min(Math.round(20 + 480 * 1.2 + 8), window.innerHeight - 300 - 20)} baseWidth={420} baseHeight={300}>
          {(onCornerDown) => <NotesApp onClose={() => setNotesOpen(false)} onCornerDown={onCornerDown} onNoteChange={setActiveNote} />}
        </DraggableWidget>
      )}

    </div>
  )
}
