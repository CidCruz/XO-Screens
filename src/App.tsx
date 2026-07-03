import { useState } from 'react'
import AppHub from './components/AppHub'
import ChatBox from './components/ChatBox'
import DraggableWidget from './components/DraggableWidget'
import type { AppItem } from './types'

const APPS: AppItem[] = [
  { id: 'chat', label: 'AI Chat', icon: '💬' },
  { id: 'notes', label: 'Quick Notes', icon: '📝' },
  { id: 'search', label: 'Smart Search', icon: '🔍' },
  { id: 'clipboard', label: 'Clipboard', icon: '📋' },
  { id: 'settings', label: 'Settings', icon: '⚙️' },
]

export default function App() {
  const [activeApp, setActiveApp] = useState('chat')
  const [chatOpen, setChatOpen] = useState(true)

  return (
    <div className="w-screen h-screen" style={{ background: 'transparent', pointerEvents: 'none' }}>

      {/* App Hub — top left, slim vertical dock */}
      <DraggableWidget initialX={20} initialY={20}>
        <AppHub
          apps={APPS}
          activeApp={activeApp}
          onSelect={(id) => { setActiveApp(id); if (id === 'chat') setChatOpen(true) }}
          onChatToggle={() => setChatOpen(o => !o)}
          chatOpen={chatOpen}
        />
      </DraggableWidget>

      {/* Chat — spawns to the right of the hub, fully independent */}
      {chatOpen && (
        <DraggableWidget initialX={110} initialY={20} className="w-80">
          <ChatBox onClose={() => setChatOpen(false)} />
        </DraggableWidget>
      )}

    </div>
  )
}
