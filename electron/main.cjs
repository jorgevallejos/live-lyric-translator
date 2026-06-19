const { app, BrowserWindow, ipcMain, dialog } = require('electron')
const fs = require('fs')
const path = require('path')
const { WebSocketServer } = require('ws')
const { safeCloseProjectionWindow } = require('./closeProjectionWindow.cjs')

const WS_PORT = 8765
let lastState = null // { currentIndex: number, blank: boolean } | null
let mainWindow = null
let projectionWindow = null
let waitingForProjectionCloseBeforeQuit = false
const projectionWindowsAllowingNativeClose = new WeakSet()

const wss = new WebSocketServer({ port: WS_PORT, host: '0.0.0.0' }, () => {
  console.log(`WebSocket server listening on port ${WS_PORT}`)
})

wss.on('connection', (ws) => {
  if (lastState) {
    ws.send(JSON.stringify({ type: 'state', ...lastState }))
  }
  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString())
      if (msg.type === 'state') {
        lastState = { currentIndex: msg.currentIndex, blank: msg.blank }
        wss.clients.forEach((client) => {
          if (client !== ws && client.readyState === 1) client.send(data.toString())
        })
      } else if (msg.type === 'command') {
        if (msg.currentIndex !== undefined && msg.blank !== undefined) {
          lastState = { currentIndex: msg.currentIndex, blank: msg.blank }
        }
        wss.clients.forEach((client) => {
          if (client.readyState === 1) client.send(data.toString())
        })
      }
    } catch (_) {}
  })
})

function getProjectionUrl() {
  const devUrl = process.env.VITE_DEV_SERVER_URL
  if (devUrl) {
    const base = devUrl.split('#')[0]
    return base + '#/projection'
  }
  return null
}

function getDistIndexPath() {
  return path.join(app.getAppPath(), 'dist', 'index.html')
}

function loadProjectionUrl(win) {
  const devUrl = getProjectionUrl()
  if (devUrl) {
    win.loadURL(devUrl)
  } else {
    win.loadFile(getDistIndexPath(), { hash: '#/projection' })
  }
}

function notifyProjectionOpened() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('projection-opened')
  }
}

function notifyProjectionClosed() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('projection-closed')
  }
}

function getOpenProjectionWindow() {
  return projectionWindow && !projectionWindow.isDestroyed() ? projectionWindow : null
}

function closeProjectionWindowIfOpen() {
  const win = getOpenProjectionWindow()
  if (!win) return
  requestProjectionWindowClose(win)
}

function requestProjectionWindowClose(win) {
  safeCloseProjectionWindow(win, {
    beforeNativeClose: (windowToClose) => {
      projectionWindowsAllowingNativeClose.add(windowToClose)
    },
  })
}

function createProjectionWindow(loadWindow) {
  const existing = getOpenProjectionWindow()
  if (existing) {
    existing.focus()
    notifyProjectionOpened()
    return existing
  }

  const win = new BrowserWindow({
    fullscreen: true,
    title: 'Projection',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  })

  projectionWindow = win
  loadWindow(win)
  notifyProjectionOpened()

  win.on('close', (event) => {
    if (projectionWindowsAllowingNativeClose.has(win)) {
      projectionWindowsAllowingNativeClose.delete(win)
      return
    }
    event.preventDefault()
    requestProjectionWindowClose(win)
  })

  win.on('closed', () => {
    if (projectionWindow === win) {
      projectionWindow = null
    }
    notifyProjectionClosed()
    if (waitingForProjectionCloseBeforeQuit) {
      waitingForProjectionCloseBeforeQuit = false
      app.quit()
    }
  })

  return win
}

function createWindow() {
  const win = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  })

  mainWindow = win

  if (process.env.VITE_DEV_SERVER_URL) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else {
    win.loadFile(getDistIndexPath())
  }

  win.on('closed', () => {
    mainWindow = null
  })

  win.webContents.setWindowOpenHandler(({ url: openUrl }) => {
    if (openUrl.includes('#/projection')) {
      createProjectionWindow((projectionWin) => {
        projectionWin.loadURL(openUrl)
      })
      return { action: 'deny' }
    }
    return { action: 'deny' }
  })
}

ipcMain.handle('projection:open', () => {
  createProjectionWindow((projectionWin) => {
    loadProjectionUrl(projectionWin)
  })
})

ipcMain.handle('projection:isOpen', () => {
  return projectionWindow != null && !projectionWindow.isDestroyed()
})

ipcMain.handle('projection:close', () => {
  closeProjectionWindowIfOpen()
})

ipcMain.handle('dialog:openFile', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [{ name: 'Video files', extensions: ['mp4', 'mov', 'webm', 'm4v', 'mkv'] }],
  })
  return result.canceled ? null : (result.filePaths[0] ?? null)
})

ipcMain.handle('fs:getFileStats', (_event, filePath) => {
  try {
    const stats = fs.statSync(filePath)
    return { exists: true, size: stats.size }
  } catch {
    return { exists: false, size: 0 }
  }
})

app.whenReady().then(createWindow)
app.on('before-quit', (event) => {
  const openProjectionWindow = getOpenProjectionWindow()
  if (!openProjectionWindow) return
  if (waitingForProjectionCloseBeforeQuit) return

  waitingForProjectionCloseBeforeQuit = true
  event.preventDefault()
  requestProjectionWindowClose(openProjectionWindow)
})
app.on('window-all-closed', () => app.quit())
