import { contextBridge, ipcRenderer } from 'electron';
import type { ClickITApi, FaceJob, Progress } from '../types/domain.ts';
import type { LicenseView } from '../licensing/types.ts';
const api: ClickITApi = {
  diagnostic: (event, details) => ipcRenderer.send('diagnostic', event, details),
  projects: () => ipcRenderer.invoke('projects:list'), create: name => ipcRenderer.invoke('projects:create', name),
  photos: id => ipcRenderer.invoke('photos:list', id), index: id => ipcRenderer.invoke('projects:index', id),
  analyze: id => ipcRenderer.invoke('projects:analyze', id), cancel: () => ipcRenderer.invoke('cancel'),
  decide: (id, patch) => ipcRenderer.invoke('photos:decide', id, patch), export: (id, mode) => ipcRenderer.invoke('export', id, mode),
  system: () => ipcRenderer.invoke('system'), settings: value => ipcRenderer.invoke('settings', value), progress: () => ipcRenderer.invoke('progress:get'),
  licenseStatus: () => ipcRenderer.invoke('license:status') as Promise<LicenseView>,
  activateLicense: key => ipcRenderer.invoke('license:activate', key) as Promise<LicenseView>,
  deactivateLicense: () => ipcRenderer.invoke('license:deactivate') as Promise<LicenseView>,
  onProgress: callback => { const listener = (_: Electron.IpcRendererEvent, value: Progress): void => callback(value); ipcRenderer.on('progress', listener); return () => { ipcRenderer.removeListener('progress', listener); }; },
  onFaceJob: callback => { const listener = (_: Electron.IpcRendererEvent, job: FaceJob): void => callback(job); ipcRenderer.on('face:job', listener); return () => { ipcRenderer.removeListener('face:job', listener); }; },
  faceReply: reply => ipcRenderer.send('face:reply', reply), faceReady: () => ipcRenderer.send('face:ready')
};
contextBridge.exposeInMainWorld('clickit', api);
