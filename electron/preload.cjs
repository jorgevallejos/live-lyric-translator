const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  openProjection: () => ipcRenderer.invoke('projection:open'),
  closeProjection: () => ipcRenderer.invoke('projection:close'),
  onProjectionClosed: (callback) => {
    const handler = () => callback()
    ipcRenderer.on('projection-closed', handler)
    return () => ipcRenderer.removeListener('projection-closed', handler)
  },
})
