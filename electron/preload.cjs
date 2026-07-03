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
  quit: () => ipcRenderer.send('quit-app'),
  minimizeToTray: () => ipcRenderer.send('minimize-to-tray'),
  readyToHide: () => ipcRenderer.send('ready-to-hide'),
  onShow: (cb) => ipcRenderer.on('show-window', cb),
  onHideAnimate: (cb) => ipcRenderer.on('hide-window-animate', cb),
  setIgnoreMouse,
})
