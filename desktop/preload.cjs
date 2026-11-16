const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('nexusDesktop', {
  chooseRepository: () => ipcRenderer.invoke('nexus:choose-repository'),
  openLink: (url) => ipcRenderer.invoke('nexus:open-link', url),
  openView: (selection) => ipcRenderer.invoke('nexus:open-view', selection),
});
