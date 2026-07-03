const { app, BrowserWindow, Tray, Menu, nativeImage, screen, globalShortcut, ipcMain, session } = require('electron')
const path = require('path')
const zlib = require('zlib')

const isDev = process.env.NODE_ENV === 'development'

let tray = null

// Build a valid 16x16 RGBA PNG in memory — no external deps needed
function makeIconPng() {
  const size = 16
  const rows = []
  for (let y = 0; y < size; y++) {
    const row = Buffer.alloc(size * 4)
    for (let x = 0; x < size; x++) {
      const cx = size / 2 - 0.5
      const cy = size / 2 - 0.5
      const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2)
      const a = dist <= size / 2 - 0.5 ? 255 : 0
      row[x * 4 + 0] = 255
      row[x * 4 + 1] = 255
      row[x * 4 + 2] = 255
      row[x * 4 + 3] = a
    }
    rows.push(row)
  }

  const rawRows = Buffer.concat(rows.map(r => Buffer.concat([Buffer.from([0]), r])))
  const compressed = zlib.deflateSync(rawRows)

  function crc32(buf) {
    const table = []
    for (let i = 0; i < 256; i++) {
      let c = i
      for (let j = 0; j < 8; j++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1)
      table[i] = c
    }
    let crc = 0xffffffff
    for (const byte of buf) crc = table[(crc ^ byte) & 0xff] ^ (crc >>> 8)
    return (crc ^ 0xffffffff) >>> 0
  }

  function chunk(type, data) {
    const lenBuf = Buffer.alloc(4)
    lenBuf.writeUInt32BE(data.length)
    const typeBuf = Buffer.from(type)
    const crcBuf = Buffer.alloc(4)
    crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])))
    return Buffer.concat([lenBuf, typeBuf, data, crcBuf])
  }

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8  // bit depth
  ihdr[9] = 6  // color type: RGBA

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), // PNG magic
    chunk('IHDR', ihdr),
    chunk('IDAT', compressed),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

function createTray(win) {
  try {
    const icon = nativeImage.createFromBuffer(makeIconPng())
    if (icon.isEmpty()) {
      console.error('[tray] icon came back empty')
      return
    }
    tray = new Tray(icon)
    tray.setToolTip('XO Screens')

    const show = () => {
      win.show()
      win.focus()
      win.webContents.send('show-window')
      if (process.platform === 'darwin') app.dock?.show()
    }
    const hide = () => {
      // Tell renderer to animate out, it will send 'ready-to-hide' when done
      win.webContents.send('hide-window-animate')
    }

    // macOS: setting a context menu suppresses the click event.
    // Use popup on right-click manually so left-click always toggles.
    tray.on('click', () => (win.isVisible() ? hide() : show()))
    tray.on('right-click', () => {
      tray.popUpContextMenu(Menu.buildFromTemplate([
        { label: 'Show XO Screens', click: show },
        { label: 'Hide',            click: hide },
        { type: 'separator' },
        { label: 'Quit', click: () => { globalShortcut.unregisterAll(); app.quit() } },
      ]))
    })

    console.log('[tray] ready')
  } catch (err) {
    console.error('[tray] failed:', err)
  }
}

function createWindow() {
  const { width, height } = screen.getPrimaryDisplay().bounds

  const win = new BrowserWindow({
    width,
    height,
    x: 0,
    y: 0,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    resizable: false,
    movable: false,
    skipTaskbar: true,
    hasShadow: false,
    focusable: true,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  win.setAlwaysOnTop(true, 'screen-saver', 1)
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  win.setFullScreenable(false)
  win.setIgnoreMouseEvents(true, { forward: true })

  if (isDev) {
    win.loadURL('http://localhost:5173')
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  ipcMain.on('set-ignore-mouse', (_, ignore) => {
    win.setIgnoreMouseEvents(ignore, { forward: true })
    if (!ignore && !win.isFocused()) win.focus()
  })

  win.webContents.on('before-input-event', (_event, input) => {
    if (input.type === 'mouseDown' && !win.isFocused()) win.focus()
  })

  ipcMain.on('hide-window', () => win.hide())

  ipcMain.on('minimize-to-tray', () => {
    // Renderer animates out then sends ready-to-hide
    win.webContents.send('hide-window-animate')
  })

  ipcMain.on('ready-to-hide', () => {
    win.hide()
    if (process.platform === 'darwin') app.dock?.hide()
  })

  ipcMain.on('quit-app', () => {
    globalShortcut.unregisterAll()
    app.quit()
  })

  globalShortcut.register('CommandOrControl+Shift+Space', () => {
    if (win.isVisible()) {
      win.webContents.send('hide-window-animate')
    } else {
      win.show()
      win.focus()
      win.webContents.send('show-window')
      if (process.platform === 'darwin') app.dock?.show()
    }
  })

  return win
}

app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(permission === 'media')
  })
  const win = createWindow()
  createTray(win)  // tray created at startup — always available
})

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
app.on('will-quit', () => globalShortcut.unregisterAll())
