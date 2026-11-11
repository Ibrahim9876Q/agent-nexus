const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('nexusDesktop', {
  chooseRepository: () => ipcRenderer.invoke('nexus:choose-repository'),
});
