/**
 * Preload for the mini-player window — minimal bridge for IPC.
 */
import { contextBridge, ipcRenderer } from 'electron';
import type { MiniPlayerData } from './mini-player';

contextBridge.exposeInMainWorld('miniAPI', {
  onUpdate(cb: (data: MiniPlayerData) => void) {
    ipcRenderer.on('mini-update', (_e, data: MiniPlayerData) => cb(data));
  },
  expand() { ipcRenderer.send('mini-expand'); },
  close()  { ipcRenderer.send('mini-close'); },
  drag()   { /* handled by -webkit-app-region: drag CSS */ },
});
