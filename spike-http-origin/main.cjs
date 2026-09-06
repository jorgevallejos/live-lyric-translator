/**
 * SPIKE — throwaway. Does serving the shell from a local http origin remove the two blockers
 * recorded on 2026-09-06?  Measures, prints, quits.  Nothing here is app code.
 */
const { app, BrowserWindow, ipcMain } = require('electron')
const http = require('http')
const fs = require('fs')
const path = require('path')

const PAGES = path.join(__dirname, 'pages')
const results = []
const note = (o) => { results.push(o); process.stdout.write('NOTED: ' + JSON.stringify(o) + '\n') }

// Two servers so we can tell same-ORIGIN from same-SITE-different-port.
function serve() {
  return new Promise((resolve) => {
    const s = http.createServer((req, res) => {
      const name = (req.url.split('?')[0].replace(/\/$/, '').split('/').pop() || 'shell') + '.html'
      const f = path.join(PAGES, name)
      if (!fs.existsSync(f)) { res.writeHead(404); return res.end('no') }
      res.writeHead(200, { 'Content-Type': 'text/html' })
      res.end(fs.readFileSync(f))
    })
    s.listen(0, '127.0.0.1', () => resolve(s.address().port))
  })
}

app.on('window-all-closed', () => {})
ipcMain.handle('spike:ping', () => 'pong-from-main-process')

const load = (win) => new Promise((r) => win.webContents.once('did-finish-load', r))
const settle = (ms) => new Promise((r) => setTimeout(r, ms))

async function run() {
  const P = await serve()   // the "tool server" origin
  const Q = await serve()   // a second origin: same site (127.0.0.1), different port

  const preload = path.join(__dirname, 'preload.cjs')

  // Mirrors the app's real handler: allow only URLs on the origins this process serves.
  const openHandler = (win) => {
    win.webContents.setWindowOpenHandler(({ url }) => {
      try {
        const u = new URL(url)
        if (u.protocol === 'http:' && u.hostname === '127.0.0.1' && (u.port === String(P) || u.port === String(Q))) {
          return { action: 'allow', overrideBrowserWindowOptions: { width: 700, height: 400, backgroundColor: '#000' } }
        }
      } catch {}
      return { action: 'deny' }
    })
  }

  async function measure(label, { shell, framePort, subFrames }) {
    const win = new BrowserWindow({
      width: 900, height: 600, show: true,
      webPreferences: {
        nodeIntegration: false, contextIsolation: true, preload,
        nodeIntegrationInSubFrames: !!subFrames,
      },
    })
    openHandler(win)
    const frameUrl = `http://127.0.0.1:${framePort}/player`
    const projUrl = `http://127.0.0.1:${framePort}/projection`

    let created = null
    win.webContents.on('did-create-window', (w) => { created = w })

    if (shell === 'file') {
      win.loadFile(path.join(PAGES, 'shell.html'), { search: `frame=${encodeURIComponent(frameUrl)}` })
    } else {
      win.loadURL(`http://127.0.0.1:${P}/shell?frame=${encodeURIComponent(frameUrl)}`)
    }
    await load(win)
    await settle(600)

    const frame = win.webContents.mainFrame.frames.find((f) => f.url.startsWith(frameUrl))
    const row = { label, shellOrigin: shell === 'file' ? 'file://' : `http://127.0.0.1:${P}`, frameOrigin: `http://127.0.0.1:${framePort}` }
    if (!frame) { row.error = 'no subframe found'; note(row); win.destroy(); return }

    // ── Q2: does the frame reach the main process? ────────────────────────────
    row.ownPreload = await frame.executeJavaScript('typeof window.electronAPI').catch((e) => 'ERR:' + e.message)
    row.viaParent = await frame.executeJavaScript(`
      (async () => { try { return await window.parent.electronAPI.ping() }
        catch (e) { return 'BLOCKED: ' + (e && e.name) + ' ' + (e && e.message).slice(0,80) } })()
    `).catch((e) => 'ERR:' + e.message)

    // ── Q1: localStorage across frame -> projection window ────────────────────
    const token = `written-by-frame-${label}-${Date.now()}`
    row.frameWrite = await frame.executeJavaScript(`
      (() => { try { localStorage.setItem('spike:state', ${JSON.stringify(token)});
        return localStorage.getItem('spike:state') } catch (e) { return 'THREW: ' + e.name } })()
    `).catch((e) => 'ERR:' + e.message)

    const opened = await frame.executeJavaScript(`
      (() => { const w = window.open(${JSON.stringify(projUrl)}, 'proj'); return w ? 'handle' : 'null' })()
    `).catch((e) => 'ERR:' + e.message)
    row.windowOpen = opened
    await settle(1200)

    if (created && !created.isDestroyed()) {
      row.projectionReads = await created.webContents.executeJavaScript(`
        (() => { try { return localStorage.getItem('spike:state') } catch (e) { return 'THREW: ' + e.name } })()
      `).catch((e) => 'ERR:' + e.message)
      row.projectionSharesStorage = row.projectionReads === token
      // and back the other way — the ack channel
      await created.webContents.executeJavaScript(`localStorage.setItem('spike:ack','from-projection')`).catch(() => {})
      await settle(200)
      row.frameReadsAck = await frame.executeJavaScript(`
        (() => { try { return localStorage.getItem('spike:ack') } catch (e) { return 'THREW: ' + e.name } })()
      `).catch((e) => 'ERR:' + e.message)
      created.destroy()
    } else {
      row.projectionReads = 'no window created'
      row.projectionSharesStorage = false
    }
    note(row)
    win.destroy()
    await settle(200)
  }

  await measure('A control: file:// shell, http frame (today)', { shell: 'file', framePort: P })
  await measure('B the question: http shell, SAME-ORIGIN frame', { shell: 'http', framePort: P })
  await measure('C http shell, same-site DIFFERENT PORT frame', { shell: 'http', framePort: Q })
  await measure('D same-origin + nodeIntegrationInSubFrames', { shell: 'http', framePort: P, subFrames: true })
  await measure('F CROSS-ORIGIN frame + nodeIntegrationInSubFrames (the leak test)', { shell: 'http', framePort: Q, subFrames: true })


  // ── E: does storage survive the tool server's port changing between launches? ──
  {
    const w1 = new BrowserWindow({ show: true, width: 500, height: 300, webPreferences: { preload } })
    await w1.loadURL(`http://127.0.0.1:${P}/shell`); await settle(300)
    await w1.webContents.executeJavaScript(`localStorage.setItem('spike:launch1','answers-from-launch-1')`)
    w1.destroy()
    const w2 = new BrowserWindow({ show: true, width: 500, height: 300, webPreferences: { preload } })
    await w2.loadURL(`http://127.0.0.1:${Q}/shell`); await settle(300)
    const read = await w2.webContents.executeJavaScript(`localStorage.getItem('spike:launch1')`)
    note({ label: 'E shell on port P, relaunched on port Q (ephemeral port)', readsPreviousAnswers: read, survivesPortChange: read === 'answers-from-launch-1' })
    w2.destroy(); await settle(200)
  }

  console.log('\n===SPIKE-RESULTS===\n' + JSON.stringify(results, null, 2) + '\n===END===')
  app.quit()
}

app.whenReady().then(() => { process.stdout.write('READY\n'); return run() }).catch((e) => { process.stdout.write('FATAL ' + (e && e.stack ? e.stack : e) + '\n'); app.quit() })
