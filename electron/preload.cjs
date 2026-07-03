const { contextBridge, ipcRenderer } = require('electron')

let ignoreState = true
let pending = false

// Throttle IPC so we don't flood main process on every mousemove
function setIgnoreMouse(ignore) {
  if (ignore === ignoreState && !pending) return
  if (pending) return
  pending = true
  requestAnimationFrame(() => {
    ipcRenderer.send('set-ignore-mouse', ignore)
    ignoreState = ignore
    pending = false
  })
}

contextBridge.exposeInMainWorld('xo', {
  platform: process.platform,
  hide: () => ipcRenderer.send('hide-window'),
  setIgnoreMouse,
})
