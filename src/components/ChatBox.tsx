import { useState, useRef, useEffect } from 'react'
import type { Message } from '../types'
import { sendToGemini } from '../gemini'

export default function ChatBox({ onClose }: { onClose: () => void }) {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '0',
      role: 'assistant',
      content: 'Hey! I\'m XO, your AI assistant. How can I help you today?',
      timestamp: new Date(),
    },
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  async function handleSend() {
    const text = input.trim()
    if (!text || loading) return

    const userMsg: Message = { id: Date.now().toString(), role: 'user', content: text, timestamp: new Date() }
    setMessages(prev => [...prev, userMsg])
    setInput('')
    setLoading(true)

    try {
      const reply = await sendToGemini(messages, text)
      setMessages(prev => [...prev, { id: Date.now().toString(), role: 'assistant', content: reply, timestamp: new Date() }])
    } catch {
      setMessages(prev => [...prev, { id: Date.now().toString(), role: 'assistant', content: '⚠️ Failed to reach Gemini. Check your API key.', timestamp: new Date() }])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="glass-dark rounded-2xl flex flex-col shadow-2xl overflow-hidden" style={{ height: '480px' }}>
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-white/10">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center">
          <span className="text-white text-xs font-bold">XO</span>
        </div>
        <div>
          <p className="text-white text-sm font-semibold">XO Assistant</p>
          <p className="text-white/40 text-xs">Powered by Gemini</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-white/40 text-xs">Online</span>
          <button
            data-no-drag
            onClick={onClose}
            className="w-6 h-6 rounded-lg flex items-center justify-center text-white/30
              hover:text-white hover:bg-white/10 transition-all cursor-pointer ml-1"
          >✕</button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto chat-scroll px-4 py-3 flex flex-col gap-3">
        {messages.map(msg => (
          <div key={msg.id} className={`fade-in flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            {msg.role === 'assistant' && (
              <div className="w-6 h-6 rounded-md bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center mr-2 mt-1 shrink-0">
                <span className="text-white text-[9px] font-bold">XO</span>
              </div>
            )}
            <div className={`max-w-[75%] px-3 py-2 rounded-2xl text-sm leading-relaxed ${
              msg.role === 'user'
                ? 'bg-violet-500/50 text-white rounded-tr-sm border border-violet-400/30'
                : 'glass text-white/90 rounded-tl-sm'
            }`}>
              {msg.content}
            </div>
          </div>
        ))}

        {loading && (
          <div className="fade-in flex justify-start">
            <div className="w-6 h-6 rounded-md bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center mr-2 mt-1 shrink-0">
              <span className="text-white text-[9px] font-bold">XO</span>
            </div>
            <div className="glass px-4 py-3 rounded-2xl rounded-tl-sm">
              <div className="flex gap-1 items-center">
                <span className="w-1.5 h-1.5 bg-violet-400 rounded-full animate-bounce [animation-delay:0ms]" />
                <span className="w-1.5 h-1.5 bg-violet-400 rounded-full animate-bounce [animation-delay:150ms]" />
                <span className="w-1.5 h-1.5 bg-violet-400 rounded-full animate-bounce [animation-delay:300ms]" />
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="px-4 py-3 border-t border-white/10">
        <div className="flex gap-2 items-end">
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
            placeholder="Ask XO anything..."
            rows={1}
            className="flex-1 glass-input rounded-xl px-3 py-2.5 text-white text-sm placeholder-white/30
              outline-none resize-none focus:border-violet-400/50 transition-colors"
            style={{ maxHeight: '120px' }}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || loading}
            className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-500
              flex items-center justify-center shrink-0 transition-all duration-200
              hover:scale-105 hover:shadow-lg hover:shadow-violet-500/30
              disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100"
          >
            <svg className="w-4 h-4 text-white rotate-90" fill="currentColor" viewBox="0 0 24 24">
              <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  )
}
