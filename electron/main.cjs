const { app, BrowserWindow, ipcMain } = require('electron')
const path = require('path')
const { WebSocketServer } = require('ws')

const WS_PORT = 8765
let lastState = null // { currentIndex: number, blank: boolean } | null
let mainWindow = null
let projectionWindow = null

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

function loadProjectionUrl(win) {
  const devUrl = getProjectionUrl()
  if (devUrl) {
    win.loadURL(devUrl)
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'), { hash: '#/projection' })
  }
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

  const url = process.env.VITE_DEV_SERVER_URL ||
    `file://${path.join(__dirname, '../dist/index.html')}`
  win.loadURL(url)

  win.on('closed', () => {
    mainWindow = null
  })

  win.webContents.setWindowOpenHandler(({ url: openUrl }) => {
    if (openUrl.includes('#/projection')) {
      if (projectionWindow && !projectionWindow.isDestroyed()) {
        projectionWindow.focus()
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('projection-opened')
        }
      } else {
        projectionWindow = new BrowserWindow({
          fullscreen: true,
          title: 'Projection',
          webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
          },
        })
        projectionWindow.loadURL(openUrl)
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('projection-opened')
        }
        projectionWindow.on('closed', () => {
          projectionWindow = null
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('projection-closed')
          }
        })
      }
      return { action: 'deny' }
    }
    return { action: 'deny' }
  })
}

ipcMain.handle('projection:open', () => {
  if (projectionWindow && !projectionWindow.isDestroyed()) {
    projectionWindow.focus()
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('projection-opened')
    }
    return
  }
  projectionWindow = new BrowserWindow({
    fullscreen: true,
    title: 'Projection',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  })
  loadProjectionUrl(projectionWindow)
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('projection-opened')
  }
  projectionWindow.on('closed', () => {
    projectionWindow = null
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('projection-closed')
    }
  })
})

ipcMain.handle('projection:isOpen', () => {
  return projectionWindow != null && !projectionWindow.isDestroyed()
})

ipcMain.handle('projection:close', () => {
  if (!projectionWindow || projectionWindow.isDestroyed()) return
  const win = projectionWindow
  if (win.isFullScreen()) {
    win.once('leave-full-screen', () => {
      if (!win.isDestroyed()) win.close()
    })
    win.setFullScreen(false)
  } else {
    win.close()
  }
})

app.whenReady().then(createWindow)
app.on('window-all-closed', () => app.quit())
