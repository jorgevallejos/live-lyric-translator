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
})
