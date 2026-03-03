const { app, BrowserWindow } = require('electron')
const path = require('path')

function createWindow() {
  const win = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  })

  const url = process.env.VITE_DEV_SERVER_URL ||
    `file://${path.join(__dirname, '../dist/index.html')}`
  win.loadURL(url)

  win.webContents.setWindowOpenHandler(({ url: openUrl }) => {
    if (openUrl.includes('#/projection')) {
      const projection = new BrowserWindow({
        fullscreen: true,
        title: 'Projection',
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
        },
      })
      projection.loadURL(openUrl)
      return { action: 'deny' }
    }
    return { action: 'deny' }
  })
}

app.whenReady().then(createWindow)
app.on('window-all-closed', () => app.quit())
