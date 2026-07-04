import { useEffect, useRef, useState } from 'react'
import { GoogleGenAI, Modality } from '@google/genai'

const API_KEY = import.meta.env.VITE_GEMINI_API_KEY

type CallState = 'connecting' | 'active' | 'speaking' | 'error'

interface Props {
  onEnd: () => void
}

declare global {
  interface Window { xo: { setIgnoreMouse: (v: boolean) => void } }
}

export default function VoiceCall({ onEnd }: Props) {
  const [state, setState] = useState<CallState>('connecting')
  const [error, setError] = useState('')
  const sessionRef = useRef<Awaited<ReturnType<InstanceType<typeof GoogleGenAI>['live']['connect']>> | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const processorRef = useRef<ScriptProcessorNode | null>(null)
  const playQueueRef = useRef<ArrayBuffer[]>([])
  const playingRef = useRef(false)
  const closedRef = useRef(false)
  const muteMicRef = useRef(false)

  useEffect(() => {
    // Force mouse capture so overlay is clickable
    window.xo?.setIgnoreMouse(false)
    return () => { /* ChatBox handles restoring on its own hover */ }
  }, [])

  useEffect(() => {
    async function start() {
      try {
        const ai = new GoogleGenAI({ apiKey: API_KEY })
        const session = await ai.live.connect({
          model: 'gemini-2.5-flash-native-audio-latest',
          config: {
            responseModalities: [Modality.AUDIO],
            systemInstruction: 'You are XO, an intelligent desktop AI voice assistant. Be concise, warm, and conversational.',
          },
          callbacks: {
            onmessage(msg) {
              const audio = msg.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data
              if (audio) {
                const bytes = Uint8Array.from(atob(audio), c => c.charCodeAt(0))
                playQueueRef.current.push(bytes.buffer)
                if (!playingRef.current) drainQueue()
              }
              // Don't switch state here — drainQueue handles it once all audio is played
            },
            onerror(e) {
              console.error('LIVE onerror:', e)
              if (!closedRef.current) { setError(String(e)); setState('error') }
            },
            onclose() {
              console.warn('LIVE onclose, closed by us?', closedRef.current)
              if (!closedRef.current) { setError('Session closed by server'); setState('error') }
            },
          },
        })

        sessionRef.current = session

        const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        streamRef.current = stream

        const ctx = new AudioContext({ sampleRate: 16000 })
        audioCtxRef.current = ctx
        const source = ctx.createMediaStreamSource(stream)
        const processor = ctx.createScriptProcessor(4096, 1, 1)
        processorRef.current = processor

        processor.onaudioprocess = e => {
          // Don't send mic audio while XO is speaking — prevents echo / self-interruption
          if (!sessionRef.current || muteMicRef.current) return
          const float32 = e.inputBuffer.getChannelData(0)
          const int16 = new Int16Array(float32.length)
          for (let i = 0; i < float32.length; i++)
            int16[i] = Math.max(-32768, Math.min(32767, float32[i] * 32768))
          const b64 = btoa(String.fromCharCode(...new Uint8Array(int16.buffer)))
          sessionRef.current.sendRealtimeInput({ audio: { data: b64, mimeType: 'audio/pcm;rate=16000' } })
        }

        source.connect(processor)
        processor.connect(ctx.destination)
        setState('active')
      } catch (e) {
        setError(String(e))
        setState('error')
      }
    }

    function drainQueue() {
      if (playQueueRef.current.length === 0) {
        playingRef.current = false
        muteMicRef.current = false   // mic back on — XO is done speaking
        setState('active')
        return
      }
      playingRef.current = true
      muteMicRef.current = true     // mute mic while XO speaks
      setState('speaking')
      const buf = playQueueRef.current.shift()!
      const ctx = audioCtxRef.current!
      const int16 = new Int16Array(buf)
      const float32 = new Float32Array(int16.length)
      for (let i = 0; i < int16.length; i++) float32[i] = int16[i] / 32768
      const audioBuf = ctx.createBuffer(1, float32.length, 24000)
      audioBuf.copyToChannel(float32, 0)
      const src = ctx.createBufferSource()
      src.buffer = audioBuf
      src.connect(ctx.destination)
      src.onended = drainQueue
      src.start()
    }

    start()
    return () => {
      closedRef.current = true
      processorRef.current?.disconnect()
      streamRef.current?.getTracks().forEach(t => t.stop())
      audioCtxRef.current?.close()
      sessionRef.current?.close()
    }
  }, [])

  function hangUp() {
    closedRef.current = true
    processorRef.current?.disconnect()
    streamRef.current?.getTracks().forEach(t => t.stop())
    audioCtxRef.current?.close()
    sessionRef.current?.close()
    onEnd()
  }

  const orb = {
    connecting: { color: 'rgba(255,255,255,0.15)', shadow: 'none',                           scale: 1    },
    active:     { color: 'rgba(52,211,153,0.25)',  shadow: '0 0 40px rgba(52,211,153,0.4)',  scale: 1    },
    speaking:   { color: 'rgba(99,102,241,0.35)',  shadow: '0 0 60px rgba(99,102,241,0.6)',  scale: 1.08 },
    error:      { color: 'rgba(239,68,68,0.25)',   shadow: '0 0 40px rgba(239,68,68,0.4)',   scale: 1    },
  }[state]

  return (
    <div
      data-no-drag
      onMouseEnter={() => window.xo?.setIgnoreMouse(false)}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(32px)',
      }}
    >
      <div style={{
        width: 120, height: 120, borderRadius: '50%',
        background: orb.color, boxShadow: orb.shadow,
        transform: `scale(${orb.scale})`, transition: 'all 0.4s ease',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        border: '1px solid rgba(255,255,255,0.15)',
      }}>
        <span style={{ color: '#fff', fontWeight: 900, fontSize: 22, letterSpacing: '-0.03em',
          textShadow: '0 0 20px rgba(255,255,255,0.8)' }}>XO</span>
      </div>

      <div style={{ marginTop: 28, color: 'rgba(255,255,255,0.6)', fontSize: 13 }}>
        {state === 'connecting' && 'Connecting…'}
        {state === 'active'     && 'Listening…'}
        {state === 'speaking'   && 'Speaking…'}
        {state === 'error'      && (
          <span style={{ color: 'rgba(239,68,68,0.8)', maxWidth: 260, textAlign: 'center', display: 'block' }}>
            {error}
          </span>
        )}
      </div>

      <button
        data-no-drag
        onClick={hangUp}
        style={{
          marginTop: 40, width: 56, height: 56, borderRadius: '50%',
          background: 'rgba(239,68,68,0.85)', border: 'none', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 0 24px rgba(239,68,68,0.4)', transition: 'transform 0.15s',
        }}
        onMouseEnter={e => (e.currentTarget.style.transform = 'scale(1.1)')}
        onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}
      >
        <svg width="22" height="22" fill="white" viewBox="0 0 24 24">
          <path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1C10.6 21 3 13.4 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1L6.6 10.8z"/>
        </svg>
      </button>
    </div>
  )
}
