import { useEffect, useRef, useState } from 'react'
import { GoogleGenAI, Modality } from '@google/genai'

const API_KEY = import.meta.env.VITE_GEMINI_API_KEY

type CallState = 'connecting' | 'active' | 'speaking' | 'error'

interface Props {
  onEnd: () => void
}

// ---------- Animated waveform bars (used when XO speaks) ----------
function WaveformBars() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, height: 40 }}>
      {[0, 1, 2, 3, 4].map(i => (
        <div
          key={i}
          style={{
            width: 4,
            borderRadius: 4,
            background: 'rgba(99,102,241,0.9)',
            animation: `xo-wave 0.9s ease-in-out ${i * 0.12}s infinite alternate`,
          }}
        />
      ))}
    </div>
  )
}

// ---------- Pulsing mic ring (used when user is speaking / listening) ----------
function MicRing({ active }: { active: boolean }) {
  return (
    <div style={{ position: 'relative', width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {active && (
        <>
          <div style={{
            position: 'absolute', inset: -8, borderRadius: '50%',
            border: '2px solid rgba(52,211,153,0.6)',
            animation: 'xo-mic-ring 1.2s ease-out infinite',
          }} />
          <div style={{
            position: 'absolute', inset: -16, borderRadius: '50%',
            border: '2px solid rgba(52,211,153,0.3)',
            animation: 'xo-mic-ring 1.2s ease-out 0.4s infinite',
          }} />
        </>
      )}
      {/* Mic icon */}
      <svg width="20" height="20" viewBox="0 0 24 24" fill={active ? 'rgba(52,211,153,0.95)' : 'rgba(255,255,255,0.35)'} style={{ transition: 'fill 0.3s' }}>
        <path d="M12 1a4 4 0 0 1 4 4v6a4 4 0 0 1-8 0V5a4 4 0 0 1 4-4zm-1 17.93V21H9a1 1 0 0 0 0 2h6a1 1 0 0 0 0-2h-2v-2.07A8.001 8.001 0 0 0 20 11a1 1 0 0 0-2 0 6 6 0 0 1-12 0 1 1 0 0 0-2 0 8.001 8.001 0 0 0 7 7.93z"/>
      </svg>
    </div>
  )
}

// Global keyframe styles injected once
const KEYFRAMES = `
@keyframes xo-wave {
  from { height: 6px;  opacity: 0.6; }
  to   { height: 36px; opacity: 1;   }
}
@keyframes xo-mic-ring {
  0%   { transform: scale(1);   opacity: 0.8; }
  100% { transform: scale(1.7); opacity: 0;   }
}
@keyframes xo-orb-pulse {
  0%, 100% { box-shadow: 0 0 40px rgba(52,211,153,0.4); }
  50%       { box-shadow: 0 0 70px rgba(52,211,153,0.7), 0 0 100px rgba(52,211,153,0.25); }
}
@keyframes xo-orb-speak {
  0%, 100% { box-shadow: 0 0 60px rgba(99,102,241,0.6); }
  50%       { box-shadow: 0 0 90px rgba(99,102,241,0.85), 0 0 130px rgba(99,102,241,0.3); }
}
`

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
        muteMicRef.current = false
        setState('active')
        return
      }
      playingRef.current = true
      muteMicRef.current = true
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

  // Orb appearance per state
  const orb = {
    connecting: {
      color: 'rgba(255,255,255,0.12)',
      animation: 'none',
      scale: 1,
    },
    active: {
      color: 'rgba(52,211,153,0.22)',
      animation: 'xo-orb-pulse 2s ease-in-out infinite',
      scale: 1,
    },
    speaking: {
      color: 'rgba(99,102,241,0.32)',
      animation: 'xo-orb-speak 1.2s ease-in-out infinite',
      scale: 1.06,
    },
    error: {
      color: 'rgba(239,68,68,0.22)',
      animation: 'none',
      scale: 1,
    },
  }[state]

  const isListening = state === 'active'
  const isSpeaking  = state === 'speaking'

  return (
    <>
      {/* Inject keyframe styles once */}
      <style>{KEYFRAMES}</style>

      <div
        data-no-drag
        onMouseEnter={() => window.xo?.setIgnoreMouse(false)}
        style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(0,0,0,0.78)', backdropFilter: 'blur(32px)',
        }}
      >
        {/* ── Orb ── */}
        <div style={{
          width: 120, height: 120, borderRadius: '50%',
          background: orb.color,
          animation: orb.animation,
          transform: `scale(${orb.scale})`, transition: 'transform 0.4s ease, background 0.4s ease',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          border: '1px solid rgba(255,255,255,0.13)',
        }}>
          <span style={{
            color: '#fff', fontWeight: 900, fontSize: 22, letterSpacing: '-0.03em',
            textShadow: '0 0 20px rgba(255,255,255,0.8)',
          }}>XO</span>
        </div>

        {/* ── Indicator area ── */}
        <div style={{
          marginTop: 28,
          height: 60,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          gap: 10,
        }}>
          {/* Waveform bars — visible when XO is speaking */}
          <div style={{
            opacity: isSpeaking ? 1 : 0,
            transform: isSpeaking ? 'translateY(0)' : 'translateY(6px)',
            transition: 'opacity 0.3s, transform 0.3s',
          }}>
            <WaveformBars />
          </div>

          {/* Mic ring — visible when listening for user */}
          <div style={{
            opacity: isListening ? 1 : 0,
            transform: isListening ? 'translateY(0)' : 'translateY(6px)',
            transition: 'opacity 0.3s, transform 0.3s',
            position: 'absolute',
          }}>
            <MicRing active={isListening} />
          </div>
        </div>

        {/* ── Status label ── */}
        <div style={{ marginTop: 8, fontSize: 13, fontWeight: 500, letterSpacing: '0.04em', transition: 'color 0.3s' }}>
          {state === 'connecting' && (
            <span style={{ color: 'rgba(255,255,255,0.45)' }}>Connecting…</span>
          )}
          {state === 'active' && (
            <span style={{ color: 'rgba(52,211,153,0.85)' }}>You're speaking</span>
          )}
          {state === 'speaking' && (
            <span style={{ color: 'rgba(130,120,255,0.9)' }}>XO is speaking</span>
          )}
          {state === 'error' && (
            <span style={{ color: 'rgba(239,68,68,0.85)', maxWidth: 260, textAlign: 'center', display: 'block' }}>
              {error}
            </span>
          )}
        </div>

        {/* ── Hang-up button ── */}
        <button
          data-no-drag
          onClick={hangUp}
          style={{
            marginTop: 44, width: 56, height: 56, borderRadius: '50%',
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
    </>
  )
}
