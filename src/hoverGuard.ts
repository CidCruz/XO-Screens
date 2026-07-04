// Global counter tracking how many DraggableWidgets the cursor is currently over.
// setIgnoreMouse(true) only fires when the count drops to zero AND no drag is active.
// All window.xo calls are guarded — this file is shared between desktop and web builds.

let hoverCount = 0
let dragCount = 0
let releaseTimer: ReturnType<typeof setTimeout> | null = null

function scheduleRelease() {
  if (releaseTimer) clearTimeout(releaseTimer)
  releaseTimer = setTimeout(() => {
    if (hoverCount === 0 && dragCount === 0) {
      window.xo?.setIgnoreMouse(true)
    }
  }, 150)
}

export function widgetEnter() {
  hoverCount++
  if (releaseTimer) clearTimeout(releaseTimer)
  window.xo?.setIgnoreMouse(false)
}

export function widgetLeave() {
  hoverCount = Math.max(0, hoverCount - 1)
  if (hoverCount === 0 && dragCount === 0) scheduleRelease()
}

export function dragStart() {
  dragCount++
  if (releaseTimer) clearTimeout(releaseTimer)
  window.xo?.setIgnoreMouse(false)
}

export function dragEnd() {
  dragCount = Math.max(0, dragCount - 1)
  if (hoverCount === 0 && dragCount === 0) scheduleRelease()
}
