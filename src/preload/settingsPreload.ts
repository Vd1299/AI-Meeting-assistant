import { contextBridge, ipcRenderer } from 'electron';
import { CHANNELS } from '../shared/channels';
import type { AppConfig } from '../config/store';

contextBridge.exposeInMainWorld('settingsApi', {
  getSettings: (): Promise<AppConfig> => ipcRenderer.invoke(CHANNELS.settingsGet),
  saveSettings: (patch: Partial<AppConfig>): Promise<AppConfig> =>
    ipcRenderer.invoke(CHANNELS.settingsSave, patch),
  pickDocFolder: (): Promise<string | null> => ipcRenderer.invoke(CHANNELS.settingsPickDocFolder),
  reingestDocs: (): Promise<{ chunks: number }> => ipcRenderer.invoke(CHANNELS.docsReingest),
});
