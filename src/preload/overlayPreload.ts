import { contextBridge, ipcRenderer } from 'electron';
import { CHANNELS } from '../shared/channels';

contextBridge.exposeInMainWorld('overlayApi', {
  platform: process.platform,

  getAudioSourceId: (): Promise<string | null> => ipcRenderer.invoke(CHANNELS.audioGetSourceId),
  startAudio: () => ipcRenderer.send(CHANNELS.audioStart),
  stopAudio: () => ipcRenderer.send(CHANNELS.audioStop),
  sendAudioChunk: (chunk: ArrayBuffer) => ipcRenderer.send(CHANNELS.audioChunk, chunk),

  sendManualQuestion: (text: string) => ipcRenderer.send(CHANNELS.questionManual, text),

  onTranscriptPartial: (cb: (text: string) => void) =>
    ipcRenderer.on(CHANNELS.transcriptPartial, (_e, text) => cb(text)),
  onTranscriptFinal: (cb: (text: string) => void) =>
    ipcRenderer.on(CHANNELS.transcriptFinal, (_e, text) => cb(text)),
  onAnswerChunk: (cb: (token: string) => void) =>
    ipcRenderer.on(CHANNELS.answerChunk, (_e, token) => cb(token)),
  onAnswerDone: (cb: () => void) => ipcRenderer.on(CHANNELS.answerDone, () => cb()),
  onAnswerError: (cb: (message: string) => void) =>
    ipcRenderer.on(CHANNELS.answerError, (_e, message) => cb(message)),
  onStatus: (cb: (status: string) => void) =>
    ipcRenderer.on(CHANNELS.statusUpdate, (_e, status) => cb(status)),
  onDocsIngestStatus: (cb: (status: string) => void) =>
    ipcRenderer.on(CHANNELS.docsIngestStatus, (_e, status) => cb(status)),

  hideOverlay: () => ipcRenderer.send(CHANNELS.windowHideOverlay),
  openSettings: () => ipcRenderer.send(CHANNELS.windowOpenSettings),
  quit: () => ipcRenderer.send(CHANNELS.windowQuit),
});
