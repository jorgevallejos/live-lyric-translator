const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  openProjection: () => ipcRenderer.invoke('projection:open'),
  closeProjection: () => ipcRenderer.invoke('projection:close'),
  isProjectionOpen: () => ipcRenderer.invoke('projection:isOpen'),
  onProjectionOpened: (callback) => {
    const handler = () => callback()
    ipcRenderer.on('projection-opened', handler)
    return () => ipcRenderer.removeListener('projection-opened', handler)
  },
  onProjectionClosed: (callback) => {
    const handler = () => callback()
    ipcRenderer.on('projection-closed', handler)
    return () => ipcRenderer.removeListener('projection-closed', handler)
  },
  /** Native file-picker, filtered to `video` (default), `audio` or `json`. Absolute path, or null. */
  openFileDialog: (kind) => ipcRenderer.invoke('dialog:openFile', kind),
  /** Returns { exists, size } for the file at the given absolute path. */
  getFileStats: (filePath) => ipcRenderer.invoke('fs:getFileStats', filePath),
  /** Opens a native multi-select picker filtered to JSON. Resolves to absolute paths, [] if cancelled. */
  openSongFileDialog: () => ipcRenderer.invoke('dialog:openSongFiles'),
  /** Reads a song file as UTF-8. Resolves to { ok: true, text } or { ok: false, error }. */
  readSongFile: (filePath) => ipcRenderer.invoke('fs:readSongFile', filePath),
  /** Native directory picker for the gig folder. Resolves to an absolute path or null. */
  openGigFolderDialog: () => ipcRenderer.invoke('dialog:openGigFolder'),
  /** Native directory picker for any folder this machine remembers. Absolute path, or null. */
  openFolderDialog: (title) => ipcRenderer.invoke('dialog:openFolder', title),
  /** One read of the gig folder: gig.json and the file its visuals pointer names. */
  readGigFolder: (folderPath, visualsPointer) =>
    ipcRenderer.invoke('gig:read', folderPath, visualsPointer),
  /** Writes gig.json. Pregonero is its only writer. */
  writeGigFile: (folderPath, text) => ipcRenderer.invoke('gig:write', folderPath, text),
  /** Writes debrief.md into the gig folder. Pregonero writes it, then Jorge edits it. */
  writeDebriefFile: (folderPath, text) => ipcRenderer.invoke('gig:writeDebrief', folderPath, text),
  /**
   * Runs one Bombista subcommand. **A song file path, never a gig** — Bombista does not know
   * Pregonero exists and does not know gigs exist.
   */
  runBombista: (subcommand, args) => ipcRenderer.invoke('bombista:run', subcommand, args),
  /** Whether `bombista` answers on this machine, and what version. */
  bombistaVersion: () => ipcRenderer.invoke('bombista:version'),
  /** The directory `align` writes into for a song. Pregonero names it and never reaches into it. */
  bombistaStagingDir: (songId) => ipcRenderer.invoke('bombista:stagingDir', songId),
  /** Starts `bombista serve` and opens a window on the address it prints. */
  openBombistaReview: (args) => ipcRenderer.invoke('bombista:review', args),
  /** Opens a tool's page in a window of its own, over localhost. Packaging, not architecture. */
  openTool: (key, folder, page, title) => ipcRenderer.invoke('tool:open', key, folder, page, title),
  closeTool: (key) => ipcRenderer.invoke('tool:close', key),
  isToolOpen: (key) => ipcRenderer.invoke('tool:isOpen', key),
  /** What displays this machine has. Read-only; the confirmation fingerprints it. */
  describeDisplays: () => ipcRenderer.invoke('display:describe'),
  /** Shells out to `bombista validate --for-performance`. Never fails closed. */
  validateSongForPerformance: (songPath) =>
    ipcRenderer.invoke('song:validateForPerformance', songPath),
})
