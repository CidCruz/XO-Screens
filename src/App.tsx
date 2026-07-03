import { useState, useEffect } from 'react'
import AppHub from './components/AppHub'
import ChatBox from './components/ChatBox'
import DraggableWidget from './components/DraggableWidget'
import type { AppItem } from './types'

const APPS: AppItem[] = [
  { id: 'chat',       label: 'AI Chat'    },
  { id: 'notes',      label: 'Notes'      },
  { id: 'search',     label: 'Search'     },
  { id: 'clipboard',  label: 'Clipboard'  },
  { id: 'screenshot', label: 'Screenshot' },
  { id: 'settings',   label: 'Settings'   },
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
    const fadeOutTimer = setTimeout(() => setFadeOut(true), 1800)
    const hide = setTimeout(() => setSplash(false), 2400)
    const appFadeIn = setTimeout(() => setAppVisible(true), 2450)
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
      <h1 style={{ color: '#fff', fontSize: '5rem', fontWeight: 900, fontStyle: 'normal', fontFamily: '"Montserrat", sans-serif', letterSpacing: '0.08em', margin: 0 }}>XO Screens</h1>
    </div>
  )

  return (
    <div className="w-screen h-screen" style={{ background: 'transparent', pointerEvents: 'none', opacity: appVisible ? 1 : 0, transition: 'opacity 0.6s ease' }}>

      <DraggableWidget initialX={20} initialY={20}>
        <AppHub apps={APPS} activeApp={visibleApp} onSelect={handleSelect} />
      </DraggableWidget>

      {chatOpen && (
        <DraggableWidget initialX={260} initialY={20} className="w-80">
          <ChatBox onClose={() => setChatOpen(false)} />
        </DraggableWidget>
      )}

    </div>
  )
}
