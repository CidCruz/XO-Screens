const { app, BrowserWindow, Tray, Menu, nativeImage, screen, globalShortcut, ipcMain, session } = require('electron')
const path = require('path')

const isDev = process.env.NODE_ENV === 'development'

let tray = null

// 16x16 white "XO" text on transparent bg — template image for macOS menu bar
function makeTrayIcon() {
  const iconPath = path.join(__dirname, '../public/tray-icon.png')
  const img = nativeImage.createFromPath(iconPath)
  img.setTemplateImage(true)
  return img
}

// 512x512 XO icon for the dock — scale up the tray PNG
function makeDockIcon() {
  const iconPath = path.join(__dirname, '../public/tray-icon.png')
  const img = nativeImage.createFromPath(iconPath)
  return img.resize({ width: 512, height: 512 })
}

function createTray(win) {
  try {
    const icon = makeTrayIcon()
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
      win.webContents.send('hide-window-animate')
    }

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

  if (process.platform === 'darwin') {
    const dockIcon = makeDockIcon()
    if (!dockIcon.isEmpty()) app.dock?.setIcon(dockIcon)
  }

  const win = createWindow()
  createTray(win)
})

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
app.on('will-quit', () => globalShortcut.unregisterAll())
