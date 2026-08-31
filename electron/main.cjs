const { app, BrowserWindow, ipcMain, dialog, protocol, net, screen } = require('electron')
const fs = require('fs')
const path = require('path')
const { WebSocketServer } = require('ws')
const { safeCloseProjectionWindow } = require('./closeProjectionWindow.cjs')
const { readSongFile } = require('./readSongFile.cjs')
const { readGigFolder, writeGigFile, writeDebriefFile } = require('./gigFolder.cjs')
const { validateSongForPerformance } = require('./bombistaValidate.cjs')
const { describeDisplays } = require('./displays.cjs')
const { runBombista, bombistaVersion } = require('./bombistaRun.cjs')
const { resolveBombista } = require('./bombistaBinary.cjs')
const { listSongFiles } = require('./songsFolder.cjs')
const { createLocalhostServer } = require('./localhostServer.cjs')
const { startBombistaServe } = require('./bombistaServe.cjs')
const { chooseProjectorDisplay } = require('./projectorDisplay.cjs')

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'media',
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, bypassCSP: true },
  },
])

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
      } else if (msg.type === 'screenSize') {
        wss.clients.forEach((client) => {
          if (client !== ws && client.readyState === 1) client.send(data.toString())
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

/**
 * Where the projection window last went, and why. Read by the renderer so the fallback is visible.
 *
 * **Not remembered across launches, and never fed back into a render.** The output size is a
 * parameter passed on every render (`docs/warp-contract.md`, caller obligation 1); this is a
 * sentence for a screen, nothing more.
 */
let lastProjectorPlacement = { placed: false, reason: null, display: null }

/**
 * **Puts the projection window on the projector, by itself.**
 *
 * The projector is the display that is not the laptop's own, and placing the window there removes
 * the drag-it-across step — the last manual thing between arming and the wall.
 *
 * **The fallback is visible.** With one display the window opens exactly as it did before, and the
 * app says so: a projection window that quietly stayed on the laptop is discovered by looking at a
 * blank wall.
 */
function projectorBounds() {
  const chosen = chooseProjectorDisplay(describeDisplays(screen))
  if (chosen.display === null) {
    lastProjectorPlacement = { placed: false, reason: chosen.reason, display: null }
    return null
  }
  // The real display object, for its bounds: `describeDisplays` reduces a display to what
  // identifies it, which is deliberately not enough to position a window with.
  const match = screen.getAllDisplays().find((d) => String(d.id) === chosen.display.id)
  if (!match) {
    lastProjectorPlacement = {
      placed: false,
      reason: 'The display chosen for the projector went away before the window opened.',
      display: null,
    }
    return null
  }
  lastProjectorPlacement = {
    placed: true,
    reason: null,
    display: `${chosen.display.width}x${chosen.display.height}`,
  }
  return match.bounds
}

function createProjectionWindow(loadWindow) {
  const existing = getOpenProjectionWindow()
  if (existing) {
    existing.focus()
    notifyProjectionOpened()
    return existing
  }

  const bounds = projectorBounds()

  const win = new BrowserWindow({
    // Positioned on the projector *before* going fullscreen: a window made fullscreen on one
    // display and then moved is a display change the renderer has to survive, and there is no
    // reason to create one when the window can simply be born in the right place.
    ...(bounds ? { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height } : {}),
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

// ── Hosting the other two tools. **Packaging, not architecture.** ────────────────────────────
//
// Each tool stays fully usable without Pregonero — that is a requirement, and it is also the
// escape hatch that makes the setup flow's strictness affordable. Nothing here passes data between
// running processes: Muralista reads and writes files, Bombista is handed a path and returns an
// exit code, and **the file is the only channel.**
//
// Served over `http://127.0.0.1`, never `file://`: Muralista's File System Access API needs a
// secure context, and `file://` also hits the `webSecurity` block on media this repo already
// solved once with `media://`.
const toolServer = createLocalhostServer()
const toolWindows = new Map()

async function openToolWindow(key, folder, page, title) {
  const existing = toolWindows.get(key)
  if (existing && !existing.isDestroyed()) {
    existing.focus()
    return { ok: true, url: existing.__pregoneroUrl }
  }
  let port
  try {
    port = await toolServer.start()
  } catch (err) {
    return { ok: false, error: (err && err.message) || String(err) }
  }
  toolServer.mount(key, folder)
  const url = `http://127.0.0.1:${port}/${key}/${page}`

  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    title,
    webPreferences: {
      // No preload, and no Node. A hosted tool is a page in a window, not a peer with a bridge:
      // giving it `electronAPI` would be the slide from "Pregonero launches a tool" to "they share
      // state at runtime", which is exactly the shape the design rejected.
      nodeIntegration: false,
      contextIsolation: true,
    },
  })
  win.__pregoneroUrl = url
  toolWindows.set(key, win)
  win.on('closed', () => {
    if (toolWindows.get(key) === win) toolWindows.delete(key)
  })
  await win.loadURL(url)
  return { ok: true, url }
}

/**
 * Opens a window on an address somebody else is serving — `bombista serve`'s.
 *
 * Same window model, no mount: the page is Bombista's, served by Bombista, and Pregonero only
 * decides where the window is.
 */
async function openToolUrl(key, url, title) {
  const existing = toolWindows.get(key)
  if (existing && !existing.isDestroyed()) {
    existing.focus()
    return { ok: true, url: existing.__pregoneroUrl }
  }
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    title,
    webPreferences: { nodeIntegration: false, contextIsolation: true },
  })
  win.__pregoneroUrl = url
  toolWindows.set(key, win)
  win.on('closed', () => {
    if (toolWindows.get(key) === win) toolWindows.delete(key)
  })
  await win.loadURL(url)
  return { ok: true, url }
}

function closeToolWindow(key) {
  const win = toolWindows.get(key)
  if (win && !win.isDestroyed()) win.close()
}

// `bombista serve` runs for as long as its window is open. One at a time, stopped with the window.
let bombistaServeChild = null

function stopBombistaServe() {
  if (bombistaServeChild) {
    try {
      bombistaServeChild.kill()
    } catch {
      /* already gone */
    }
    bombistaServeChild = null
  }
}

function createWindow() {
  const win = new BrowserWindow({
    // Open at iPad Pro 13" (M4) landscape logical size. useContentSize makes these
    // the web-content dimensions (excluding the Mac title bar), so the control layout
    // gets the exact iPad viewport it's designed against, even on the Mac mini.
    width: 1376,
    height: 1032,
    useContentSize: true,
    center: true,
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

/** Where the projection window went, and why — so a one-display fallback is said rather than seen. */
ipcMain.handle('projection:placement', () => lastProjectorPlacement)

ipcMain.handle('projection:isOpen', () => {
  return projectionWindow != null && !projectionWindow.isDestroyed()
})

ipcMain.handle('projection:close', () => {
  closeProjectionWindowIfOpen()
})

const FILE_FILTERS = {
  video: { name: 'Video files', extensions: ['mp4', 'mov', 'webm', 'm4v', 'mkv'] },
  audio: { name: 'Audio files', extensions: ['m4a', 'mp3', 'wav', 'aif', 'aiff', 'flac', 'ogg'] },
  json: { name: 'Song files', extensions: ['json'] },
}

ipcMain.handle('dialog:openFile', async (_event, kind) => {
  const filter = FILE_FILTERS[kind] || FILE_FILTERS.video
  const result = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [filter],
  })
  return result.canceled ? null : (result.filePaths[0] ?? null)
})

ipcMain.handle('dialog:openSongFiles', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'Song files', extensions: ['json'] }],
  })
  return result.canceled ? [] : result.filePaths
})

ipcMain.handle('fs:readSongFile', (_event, filePath) => readSongFile(filePath))

// **What songs are in the songs folder.** Until this existed the app had no way to look: the
// library is a list of references added one at a time, so a machine whose songs folder held the
// whole catalogue reported "No songs yet". `songs/` is the source of truth; this is how it is read.
ipcMain.handle('fs:listSongsFolder', (_event, folderPath) => listSongFiles(String(folderPath)))

// ── The gig folder. Every Electron call this round introduces lives behind `src/platform.ts`
// on the renderer side; these are its four handlers. ──────────────────────────────────────────
ipcMain.handle('dialog:openGigFolder', async () => {
  const result = await dialog.showOpenDialog({
    title: 'Choose the gig folder',
    properties: ['openDirectory', 'createDirectory'],
  })
  return result.canceled ? null : (result.filePaths[0] ?? null)
})

// Any folder this machine is asked to remember — the songs root, the media folder. The gig
// folder keeps its own handler because its picker offers to create one; these never do.
ipcMain.handle('dialog:openFolder', async (_event, title) => {
  const result = await dialog.showOpenDialog({
    title: typeof title === 'string' && title ? title : 'Choose a folder',
    properties: ['openDirectory'],
  })
  return result.canceled ? null : (result.filePaths[0] ?? null)
})

ipcMain.handle('gig:read', (_event, folderPath, visualsPointer) =>
  readGigFolder(folderPath, visualsPointer ? { visualsPointer } : {})
)

ipcMain.handle('gig:write', (_event, folderPath, text) => writeGigFile(folderPath, text))

ipcMain.handle('gig:writeDebrief', (_event, folderPath, text) => writeDebriefFile(folderPath, text))

ipcMain.handle('song:validateForPerformance', (_event, songPath, bombistaPath) =>
  validateSongForPerformance(songPath, { bombistaPath })
)

// What displays this machine has. Read-only: the setup confirmation fingerprints it so it can
// notice the projector was unplugged, and nothing renders from it.
ipcMain.handle('display:describe', () => describeDisplays(screen))

// ── Bombista, and Muralista ───────────────────────────────────────────────────────────────────
// **Pass a song file path, never a gig.** Bombista does not know Pregonero exists and does not
// know gigs exist. Hosting its review page changes packaging, not knowledge.
// **The binary is resolved, never inherited.** A Finder-launched app's PATH is
// /usr/bin:/bin:/usr/sbin:/sbin and cannot see ~/.local/bin, where pipx puts a Python CLI — so
// every one of these was `skipped` in exactly the launch mode a performer uses. The path
// preferences holds travels with the call, so the main process stays stateless about settings.
ipcMain.handle('bombista:run', (_event, subcommand, args, bombistaPath) =>
  runBombista(subcommand, Array.isArray(args) ? args : [], { bombistaPath })
)

ipcMain.handle('bombista:version', (_event, bombistaPath) => bombistaVersion({ bombistaPath }))

/** Where Pregonero found it, and everywhere it looked. For preferences to say out loud. */
ipcMain.handle('bombista:locate', (_event, bombistaPath) => resolveBombista(bombistaPath))

/** Where `align` writes. Pregonero names the directory and never reaches into it. */
ipcMain.handle('bombista:stagingDir', (_event, songId) => {
  const dir = path.join(app.getPath('userData'), 'bombista-staging', String(songId || 'song'))
  try {
    fs.mkdirSync(dir, { recursive: true })
    return { ok: true, path: dir }
  } catch (err) {
    return { ok: false, error: (err && err.message) || String(err) }
  }
})

ipcMain.handle('tool:open', (_event, key, folder, page, title) =>
  openToolWindow(String(key), String(folder), String(page), String(title || key))
)

/**
 * Starts `bombista serve` and opens a window on the address it prints.
 *
 * **A subprocess and a window, and nothing else.** Bombista serves its own review page — which is
 * why it is not hosted from Pregonero's server: the static `--emit html` page names its audio with
 * a path relative to the staging directory, so serving it from anywhere else gives a review page
 * that cannot play the two lines it exists to let you hear.
 */
ipcMain.handle('bombista:review', async (_event, args, bombistaPath) => {
  stopBombistaServe()
  const started = await startBombistaServe(Array.isArray(args) ? args : [], { bombistaPath })
  if (!started.ok) return { ok: false, error: started.error }
  bombistaServeChild = started.child
  const opened = await openToolUrl('bombista', started.url, 'Bombista — review')
  return opened.ok ? { ok: true, url: started.url } : opened
})

ipcMain.handle('tool:close', (_event, key) => {
  closeToolWindow(String(key))
  if (String(key) === 'bombista') stopBombistaServe()
})

ipcMain.handle('tool:isOpen', (_event, key) => {
  const win = toolWindows.get(String(key))
  return win != null && !win.isDestroyed()
})

ipcMain.handle('fs:getFileStats', (_event, filePath) => {
  try {
    const stats = fs.statSync(filePath)
    return { exists: true, size: stats.size }
  } catch {
    return { exists: false, size: 0 }
  }
})

app.whenReady().then(() => {
  protocol.handle('media', (request) => {
    // media://local/Users/... — host is the fixed sentinel "local"; pathname is the
    // absolute filesystem path. decodeURIComponent restores percent-encoded segments.
    const { pathname } = new URL(request.url)
    const absolutePath = decodeURIComponent(pathname)
    const fileUrl = require('node:url').pathToFileURL(absolutePath).toString()
    return net.fetch(fileUrl, { headers: request.headers })
  })
  createWindow()
})
app.on('before-quit', (event) => {
  const openProjectionWindow = getOpenProjectionWindow()
  if (!openProjectionWindow) return
  if (waitingForProjectionCloseBeforeQuit) return

  waitingForProjectionCloseBeforeQuit = true
  event.preventDefault()
  requestProjectionWindowClose(openProjectionWindow)
})
app.on('before-quit', () => stopBombistaServe())
app.on('window-all-closed', () => app.quit())
