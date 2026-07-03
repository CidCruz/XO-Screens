import { useState, useEffect } from 'react'
import AppHub from './components/AppHub'
import ChatBox from './components/ChatBox'
import DraggableWidget from './components/DraggableWidget'
import type { AppItem } from './types'

const APPS: AppItem[] = [
  { id: 'chat',     label: 'AI Chat'        },
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

  useEffect(() => {
    const fadeInTimer = setTimeout(() => setFadeIn(true), 50)
    const fadeOutTimer = setTimeout(() => setFadeOut(true), 3500)
    const hide = setTimeout(() => setSplash(false), 4200)
    const appFadeIn = setTimeout(() => setAppVisible(true), 4250)
    return () => { clearTimeout(fadeInTimer); clearTimeout(fadeOutTimer); clearTimeout(hide); clearTimeout(appFadeIn) }
  }, [])

  function handleSelect(id: string) {
    setActiveApp(id)
    if (id === 'chat') setChatOpen(prev => !prev)
  }

  const visibleApp = chatOpen ? activeApp : ''

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
    <div className="w-screen h-screen" style={{ background: 'transparent', pointerEvents: 'none', opacity: appVisible ? 1 : 0, transition: 'opacity 0.6s ease' }}>

      <DraggableWidget initialX={20} initialY={Math.round((window.innerHeight - 300) / 2)} baseWidth={64} baseHeight={300}>
        {(onCornerDown) => <AppHub apps={APPS} activeApp={visibleApp} onSelect={handleSelect} onCornerDown={onCornerDown} />}
      </DraggableWidget>

      {chatOpen && (
        <DraggableWidget initialX={Math.round(window.innerWidth - 320 * 1.2 - 20)} initialY={20} baseWidth={320} baseHeight={480} initialScale={1.2}>
          {(onCornerDown) => <ChatBox onClose={() => setChatOpen(false)} onCornerDown={onCornerDown} />}
        </DraggableWidget>
      )}

    </div>
  )
}
