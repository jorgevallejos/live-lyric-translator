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
})
