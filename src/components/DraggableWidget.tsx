import { useRef, useState, useEffect, ReactNode } from 'react'

declare global {
  interface Window {
    xo?: { hide: () => void; platform: string; setIgnoreMouse: (v: boolean) => void }
  }
}

interface Props {
  children: ReactNode
  initialX: number
  initialY: number
  className?: string
}

export default function DraggableWidget({ children, initialX, initialY, className = '' }: Props) {
  const [pos, setPos] = useState({ x: initialX, y: initialY })
  const [isDragging, setIsDragging] = useState(false)
  const dragging = useRef(false)
  const offset = useRef({ x: 0, y: 0 })
  const isHovered = useRef(false)

  // Always capture mouse when hovering OR dragging
  function onMouseEnter() {
    isHovered.current = true
    window.xo?.setIgnoreMouse(false)
  }

  function onMouseLeave() {
    isHovered.current = false
    if (!dragging.current) {
      window.xo?.setIgnoreMouse(true)
    }
  }

  function onMouseDown(e: React.MouseEvent) {
    const target = e.target as HTMLElement
    if (target.closest('button, input, textarea, a, [data-no-drag]')) return
    dragging.current = true
    setIsDragging(true)
    // Keep mouse captured at Electron level during drag
    window.xo?.setIgnoreMouse(false)
    offset.current = { x: e.clientX - pos.x, y: e.clientY - pos.y }
    e.preventDefault()
  }

  useEffect(() => {
    function onMove(e: MouseEvent) {
      if (!dragging.current) return
      // Keep Electron mouse capture active throughout drag
      window.xo?.setIgnoreMouse(false)
      setPos({ x: e.clientX - offset.current.x, y: e.clientY - offset.current.y })
    }

    function onUp() {
      if (!dragging.current) return
      dragging.current = false
      setIsDragging(false)
      // Only release if mouse already left the widget
      if (!isHovered.current) {
        window.xo?.setIgnoreMouse(true)
      }
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [])

  return (
    <div
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onMouseDown={onMouseDown}
      style={{
        position: 'fixed',
        left: pos.x,
        top: pos.y,
        zIndex: 9999,
        userSelect: 'none',
        cursor: isDragging ? 'grabbing' : 'default',
        pointerEvents: 'auto',
      }}
      className={className}
    >
      {/* Visible drag handle — always shown at top of widget */}
      <div
        className="flex items-center justify-center w-full pb-1"
        style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
      >
        <div className="w-10 h-1 rounded-full bg-white/25 hover:bg-white/50 transition-colors" />
      </div>
      {children}
    </div>
  )
}
