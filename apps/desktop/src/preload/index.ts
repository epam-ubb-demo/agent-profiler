import { ipcChannels } from '@agent-profiler/core';
import { contextBridge, ipcRenderer } from 'electron';

import type { ElectronApi } from './api';

const api: ElectronApi = {
  getVersion: () => ipcRenderer.invoke('app:getVersion'),
  session: {
    list: () => ipcRenderer.invoke('session:list'),
    open: (sessionId: string) => ipcRenderer.invoke('session:open', sessionId),
    setRootDir: (dir: string) => ipcRenderer.invoke('session:setRootDir', dir),
    onListUpdated: (callback) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const handler = (_event: any, sessions: any) => {
        callback(sessions);
      };
      ipcRenderer.on(ipcChannels.SESSION_LIST_UPDATED, handler);
      return () => {
        ipcRenderer.removeListener(ipcChannels.SESSION_LIST_UPDATED, handler);
      };
    },
    getScanningState: () => ipcRenderer.invoke(ipcChannels.SESSION_SCANNING_STATE),
    onScanningStateChanged: (callback) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const handler = (_event: any, scanning: any) => {
        callback(scanning);
      };
      ipcRenderer.on(ipcChannels.SESSION_SCANNING_STATE, handler);
      return () => {
        ipcRenderer.removeListener(ipcChannels.SESSION_SCANNING_STATE, handler);
      };
    },
  },
  dialog: {
    openDirectory: () => ipcRenderer.invoke('dialog:openDirectory'),
  },
  pdf: {
    selectOutputPath: () => ipcRenderer.invoke('pdf:select-output-path'),
    exportCurrentView: (options) => ipcRenderer.invoke('pdf:export-current-view', options),
    exportSession: (session, options) =>
      ipcRenderer.invoke('pdf:export-session', { session, options }),
  },
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    set: (settings) => ipcRenderer.invoke('settings:set', settings),
    testConnection: () => ipcRenderer.invoke('settings:testConnection'),
  },
};

contextBridge.exposeInMainWorld('electronApi', api);
