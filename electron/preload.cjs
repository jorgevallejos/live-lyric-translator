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
  /** Opens a native file-picker filtered to video files. Resolves to the chosen absolute path or null. */
  openFileDialog: () => ipcRenderer.invoke('dialog:openFile'),
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
  /** Shells out to `bombista validate --for-performance`. Never fails closed. */
  validateSongForPerformance: (songPath) =>
    ipcRenderer.invoke('song:validateForPerformance', songPath),
})
