const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('ythist', {
  pickTakeoutFile: () => ipcRenderer.invoke('ythist:pick-takeout-file')
});
