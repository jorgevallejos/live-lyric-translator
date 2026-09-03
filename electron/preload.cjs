const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  openProjection: () => ipcRenderer.invoke('projection:open'),
  closeProjection: () => ipcRenderer.invoke('projection:close'),
  isProjectionOpen: () => ipcRenderer.invoke('projection:isOpen'),
  /** Where the projection window went, and why. The one-display fallback is visible, not silent. */
  projectionPlacement: () => ipcRenderer.invoke('projection:placement'),
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
  /**
   * Native file-picker, filtered to `video` (default), `audio`, `json` or `lyrics`. Absolute path,
   * or null. `defaultPath` is where it opens — the renderer remembers that per picker.
   */
  openFileDialog: (kind, defaultPath) => ipcRenderer.invoke('dialog:openFile', kind, defaultPath),
  /** Returns { exists, size } for the file at the given absolute path. */
  getFileStats: (filePath) => ipcRenderer.invoke('fs:getFileStats', filePath),
  /** Opens a native multi-select picker filtered to JSON. Resolves to absolute paths, [] if cancelled. */
  /** Reads a song file as UTF-8. Resolves to { ok: true, text } or { ok: false, error }. */
  readSongFile: (filePath) => ipcRenderer.invoke('fs:readSongFile', filePath),
  /** Native directory picker for the gig folder. Resolves to an absolute path or null. */
  /** Native directory picker for any folder this machine remembers. Absolute path, or null. */
  openFolderDialog: (title, defaultPath) =>
    ipcRenderer.invoke('dialog:openFolder', title, defaultPath),
  /** One read of `<gig>/setup`: gig.json and the file its visuals pointer names, beside it. */
  readGigFolder: (folderPath, visualsPointer) =>
    ipcRenderer.invoke('gig:read', folderPath, visualsPointer),
  /** Makes a gig's folder under the gigs root. A name, never a path. */
  createGigFolder: (setupRoot, name) => ipcRenderer.invoke('gig:createFolder', setupRoot, name),
  /** Writes gig.json into `<gig>/setup`, making it if needed. Pregonero is its only writer. */
  writeGigFile: (folderPath, text) => ipcRenderer.invoke('gig:write', folderPath, text),
  /** Writes debrief.md at the gig folder's root — the author's half. He finishes it. */
  writeDebriefFile: (folderPath, text) => ipcRenderer.invoke('gig:writeDebrief', folderPath, text),
  /**
   * Runs one Bombista subcommand. **A song file path, never a gig** — Bombista does not know
   * Pregonero exists and does not know gigs exist.
   */
  runBombista: (subcommand, args, bombistaPath) =>
    ipcRenderer.invoke('bombista:run', subcommand, args, bombistaPath),
  /** Whether `bombista` answers on this machine, and what version. */
  bombistaVersion: (bombistaPath) => ipcRenderer.invoke('bombista:version', bombistaPath),
  /**
   * Where Pregonero found `bombista`, and everywhere it looked.
   *
   * `bombistaPath` is what preferences holds, and it travels on every call: the main process is
   * told the setting rather than reading it, so it stays stateless about renderer settings the
   * way it already is about the songs and media folders.
   */
  locateBombista: (bombistaPath) => ipcRenderer.invoke('bombista:locate', bombistaPath),
  /** The directory `align` writes into for a song. Pregonero names it and never reaches into it. */
  bombistaStagingDir: (songId) => ipcRenderer.invoke('bombista:stagingDir', songId),
  /** Starts `bombista serve` and hands back the address it prints. Opens no window. */
  startBombistaFlow: (args, bombistaPath) =>
    ipcRenderer.invoke('bombista:startFlow', args, bombistaPath),
  /** Stops it. */
  stopBombistaFlow: () => ipcRenderer.invoke('bombista:stopFlow'),
  /** The `<stem>.json` `Save to the catalogue` wrote into a staging directory, or null. */
  emittedSong: (stagingDir, since) => ipcRenderer.invoke('bombista:emitted', stagingDir, since),
  /** The song files in `<songs>/song-performance`. The folder is the truth; the library caches it. */
  listSongsFolder: (folderPath) => ipcRenderer.invoke('fs:listSongsFolder', folderPath),
  /** Whether a folder can be read at all. { ok: true } or { ok: false, error }. */
  folderReadable: (folderPath) => ipcRenderer.invoke('fs:folderReadable', folderPath),
  /** Moves one song file to the Trash. { ok: true } or { ok: false, error }. */
  deleteSongFile: (filePath) => ipcRenderer.invoke('fs:deleteSongFile', filePath),
  /** Moves one gig's `setup/<gig>/` folder to the Trash. { ok: true } or { ok: false, error }. */
  deleteGigFolder: (folderPath) => ipcRenderer.invoke('fs:deleteGigFolder', folderPath),
  /** Replaces a song file with the candidate an edit produced, backing the original up first. */
  replaceSongFile: (candidatePath, targetPath) =>
    ipcRenderer.invoke('fs:replaceSongFile', candidatePath, targetPath),
  /** Opens a tool's page in a window of its own, over localhost. Packaging, not architecture. */
  openTool: (key, folder, page, title) => ipcRenderer.invoke('tool:open', key, folder, page, title),
  closeTool: (key) => ipcRenderer.invoke('tool:close', key),
  isToolOpen: (key) => ipcRenderer.invoke('tool:isOpen', key),
  /** What displays this machine has. Read-only; the confirmation fingerprints it. */
  describeDisplays: () => ipcRenderer.invoke('display:describe'),
  /** Shells out to `bombista validate --for-performance`. Never fails closed. */
  validateSongForPerformance: (songPath, bombistaPath) =>
    ipcRenderer.invoke('song:validateForPerformance', songPath, bombistaPath),
})
