import { contextBridge, ipcRenderer } from 'electron';

import type { ElectronApi } from './api';

const api: ElectronApi = {
  getVersion: () => ipcRenderer.invoke('app:getVersion'),
  session: {
    list: () => ipcRenderer.invoke('session:list'),
    open: (sessionId: string) => ipcRenderer.invoke('session:open', sessionId),
    setRootDir: (dir: string) => ipcRenderer.invoke('session:setRootDir', dir),
  },
};

contextBridge.exposeInMainWorld('electronApi', api);
