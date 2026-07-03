import { useRef, useState, useEffect, ReactNode } from 'react'

declare global {
  interface Window {
    xo?: { hide: () => void; platform: string; setIgnoreMouse: (v: boolean) => void }
  }
}

interface Props {
  children: ReactNode | ((onCornerDown: (e: React.MouseEvent, dx: number, dy: number) => void) => ReactNode)
  initialX: number
  initialY: number
  className?: string
  baseWidth?: number
  baseHeight?: number
  initialScale?: number
}

const MIN_SCALE = 0.8
const MAX_SCALE = 1.8

export default function DraggableWidget({ children, initialX, initialY, className = '', baseWidth = 0, baseHeight = 0, initialScale = 1 }: Props) {
  const [pos, setPos] = useState({ x: initialX, y: initialY })
  const [scale, setScale] = useState(initialScale)
  const [isDragging, setIsDragging] = useState(false)
  const dragging = useRef(false)
  const resizing = useRef(false)
  const offset = useRef({ x: 0, y: 0 })
  const isHovered = useRef(false)
  const resizeData = useRef({ x: 0, y: 0, scale: 1, dx: 1, dy: 1, posX: 0, posY: 0 })
  const scaleRef = useRef(initialScale)

  function onMouseEnter() {
    isHovered.current = true
    window.xo?.setIgnoreMouse(false)
  }

  function onMouseLeave() {
    isHovered.current = false
    if (!dragging.current && !resizing.current) window.xo?.setIgnoreMouse(true)
  }

  function onMouseDown(e: React.MouseEvent) {
    const target = e.target as HTMLElement
    if (target.closest('button, input, textarea, a, [data-no-drag]')) return
    dragging.current = true
    setIsDragging(true)
    window.xo?.setIgnoreMouse(false)
    offset.current = { x: e.clientX - pos.x, y: e.clientY - pos.y }
    e.preventDefault()
  }

  function onCornerDown(e: React.MouseEvent, dx: number, dy: number) {
    e.stopPropagation(); e.preventDefault()
    resizing.current = true
    resizeData.current = { x: e.clientX, y: e.clientY, scale: scaleRef.current, dx, dy, posX: pos.x, posY: pos.y }
    window.xo?.setIgnoreMouse(false)
  }

  useEffect(() => {
    function onMove(e: MouseEvent) {
      if (dragging.current) {
        window.xo?.setIgnoreMouse(false)
        setPos({ x: e.clientX - offset.current.x, y: e.clientY - offset.current.y })
      }
      if (resizing.current) {
        const { x, y, scale: s, dx, dy, posX, posY } = resizeData.current
        const delta = ((e.clientX - x) * dx + (e.clientY - y) * dy) / 300
        const newScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, s + delta))
        const diff = newScale - s
        const newX = dx === -1 ? posX - baseWidth * diff : posX
        const newY = dy === -1 ? posY - baseHeight * diff : posY
        scaleRef.current = newScale
        setScale(newScale)
        setPos({ x: newX, y: newY })
      }
    }
    function onUp() {
      dragging.current = false
      resizing.current = false
      setIsDragging(false)
      if (!isHovered.current) window.xo?.setIgnoreMouse(true)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
  }, [baseWidth, baseHeight])

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
        transform: `scale(${scale})`,
        transformOrigin: 'top left',
        overflow: 'visible',
      }}
      className={className}
    >
      {typeof children === 'function'
        ? (children as (onCornerDown: (e: React.MouseEvent, dx: number, dy: number) => void) => ReactNode)(onCornerDown)
        : children}
    </div>
  )
}
