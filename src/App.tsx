import { useState } from 'react'
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
  const [activeApp, setActiveApp] = useState('chat')
  const [chatOpen, setChatOpen] = useState(true)

  function handleSelect(id: string) {
    setActiveApp(id)
    if (id === 'chat') setChatOpen(prev => !prev)
  }

  return (
    <div className="w-screen h-screen" style={{ background: 'transparent', pointerEvents: 'none' }}>

      <DraggableWidget initialX={20} initialY={20}>
        <AppHub apps={APPS} activeApp={activeApp} onSelect={handleSelect} />
      </DraggableWidget>

      {chatOpen && (
        <DraggableWidget initialX={260} initialY={20} className="w-80">
          <ChatBox onClose={() => setChatOpen(false)} />
        </DraggableWidget>
      )}

    </div>
  )
}
