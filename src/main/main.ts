import { app, BrowserWindow, Tray, Menu, ipcMain, desktopCapturer, dialog } from 'electron';
import path from 'path';

// Quiets Chromium's own background network chatter (component updates, safe
// browsing, etc.) -- unrelated to this app's own Deepgram/OpenAI calls, which
// run through Node's network stack in this process, not Chromium's.
app.commandLine.appendSwitch('disable-background-networking');
import { CHANNELS } from '../shared/channels';
import { getConfig, saveConfig, type AppConfig } from '../config/store';
import { RagIndex, type Chunk } from '../services/rag';
import { DeepgramStreamer } from '../services/deepgram';
import { streamAnswer, type HistoryTurn } from '../services/llm';

let overlayWin: BrowserWindow | null = null;
let tray: Tray | null = null;
let deepgram: DeepgramStreamer | null = null;
const ragIndex = new RagIndex(app.getPath('userData'));
const history: HistoryTurn[] = [];
const MAX_HISTORY_TURNS = 5;
const MIN_QUESTION_WORDS = 3;
const SILENCE_TRIGGER_MS = 3000;

let questionBuffer = '';
let silenceTimer: NodeJS.Timeout | null = null;

function clearSilenceTimer() {
  if (silenceTimer) clearTimeout(silenceTimer);
  silenceTimer = null;
}

function resetSilenceTimer() {
  clearSilenceTimer();
  silenceTimer = setTimeout(() => {
    const pending = questionBuffer.trim();
    questionBuffer = '';
    if (pending) handleQuestion(pending);
  }, SILENCE_TRIGGER_MS);
}

function sendToOverlay(channel: string, payload?: unknown) {
  if (overlayWin && !overlayWin.isDestroyed()) {
    overlayWin.webContents.send(channel, payload);
  }
}

async function ensureRagBuilt() {
  const config = getConfig();
  if (!config.openaiApiKey || !config.docFolder) return;
  try {
    ragIndex.setApiKey(config.openaiApiKey);
    const result = await ragIndex.build(config.docFolder);
    sendToOverlay(CHANNELS.docsIngestStatus, `Indexed ${result.files} doc(s), ${result.chunks} chunk(s)`);
  } catch (err: any) {
    console.error('[main] RAG build failed:', err);
    sendToOverlay(CHANNELS.docsIngestStatus, `Doc indexing failed: ${err.message ?? err}`);
  }
}

async function handleQuestion(question: string) {
  const config = getConfig();
  const trimmed = question.trim();
  if (trimmed.split(/\s+/).length < MIN_QUESTION_WORDS) return;

  sendToOverlay(CHANNELS.transcriptFinal, trimmed);

  if (!config.openaiApiKey) {
    sendToOverlay(CHANNELS.answerError, 'OpenAI API key missing -- open Settings to add it.');
    return;
  }

  try {
    let context: Chunk[] = [];
    if (ragIndex.size > 0) {
      context = await ragIndex.retrieve(trimmed);
    }

    let full = '';
    await streamAnswer(config.openaiApiKey, config.chatModel, trimmed, context, history, (token) => {
      full += token;
      sendToOverlay(CHANNELS.answerChunk, token);
    });
    sendToOverlay(CHANNELS.answerDone);

    history.push({ role: 'user', content: trimmed });
    history.push({ role: 'assistant', content: full });
    while (history.length > MAX_HISTORY_TURNS * 2) history.shift();
  } catch (err: any) {
    console.error('[main] Answer generation failed:', err);
    sendToOverlay(CHANNELS.answerError, `Answer generation failed: ${err.message ?? err}`);
  }
}

function createDeepgramStreamer() {
  const config = getConfig();
  if (!config.deepgramApiKey) {
    sendToOverlay(CHANNELS.statusUpdate, 'Deepgram API key missing -- open Settings to add it.');
    return null;
  }
  return new DeepgramStreamer(config.deepgramApiKey, {
    onInterim: (text) => {
      sendToOverlay(CHANNELS.transcriptPartial, `${questionBuffer} ${text}`.trim());
      resetSilenceTimer();
    },
    onFinal: (text) => {
      questionBuffer = `${questionBuffer} ${text}`.trim();
      sendToOverlay(CHANNELS.transcriptPartial, questionBuffer);
      resetSilenceTimer();
    },
    onStatus: (status) => sendToOverlay(CHANNELS.statusUpdate, status),
  });
}

function registerIpcHandlers() {
  ipcMain.handle(CHANNELS.audioGetSourceId, async () => {
    const sources = await desktopCapturer.getSources({ types: ['screen'] });
    return sources[0]?.id ?? null;
  });

  ipcMain.on(CHANNELS.audioStart, async () => {
    await ensureRagBuilt();
    deepgram?.stop();
    deepgram = createDeepgramStreamer();
    deepgram?.start();
  });

  ipcMain.on(CHANNELS.audioStop, () => {
    deepgram?.stop();
    deepgram = null;
    clearSilenceTimer();
    questionBuffer = '';
  });

  ipcMain.on(CHANNELS.audioChunk, (_event, chunk: ArrayBuffer) => {
    deepgram?.sendAudio(Buffer.from(chunk));
  });

  ipcMain.on(CHANNELS.questionManual, (_event, text: string) => {
    clearSilenceTimer();
    questionBuffer = '';
    handleQuestion(text);
  });

  ipcMain.on(CHANNELS.windowHideOverlay, () => {
    overlayWin?.hide();
  });

  ipcMain.on(CHANNELS.windowOpenSettings, () => {
    void import('./settingsWindow').then((m) => m.openSettingsWindow());
  });

  ipcMain.on(CHANNELS.windowQuit, () => {
    app.quit();
  });

  ipcMain.handle(CHANNELS.settingsGet, () => getConfig());

  ipcMain.handle(CHANNELS.settingsSave, (_event, patch: Partial<AppConfig>) => {
    const updated = saveConfig(patch);
    void ensureRagBuilt();
    return updated;
  });

  ipcMain.handle(CHANNELS.settingsPickDocFolder, async (event) => {
    const ownerWindow = BrowserWindow.fromWebContents(event.sender);
    // The overlay is always-on-top, which can bury an unrelated dialog even when
    // it's properly parented to the settings window -- drop it for the duration.
    overlayWin?.setAlwaysOnTop(false);
    try {
      const result = ownerWindow
        ? await dialog.showOpenDialog(ownerWindow, { properties: ['openDirectory'] })
        : await dialog.showOpenDialog({ properties: ['openDirectory'] });
      if (result.canceled || result.filePaths.length === 0) return null;
      return result.filePaths[0];
    } finally {
      overlayWin?.setAlwaysOnTop(true, 'floating');
    }
  });

  ipcMain.handle(CHANNELS.docsReingest, async () => {
    await ensureRagBuilt();
    return { chunks: ragIndex.size };
  });
}

function createTray() {
  tray = new Tray(path.join(__dirname, '..', '..', 'assets', 'tray-icon.png'));
  const menu = Menu.buildFromTemplate([
    {
      label: 'Show Overlay',
      click: () => {
        overlayWin?.show();
      },
    },
    {
      label: 'Hide Overlay',
      click: () => {
        overlayWin?.hide();
      },
    },
    {
      label: 'Settings',
      click: () => {
        void import('./settingsWindow').then((m) => m.openSettingsWindow());
      },
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        deepgram?.stop();
        app.quit();
      },
    },
  ]);
  tray.setToolTip('AI Interview Assistant');
  tray.setContextMenu(menu);
  tray.on('click', () => {
    overlayWin?.isVisible() ? overlayWin.hide() : overlayWin?.show();
  });
}

app.whenReady().then(async () => {
  if (process.platform === 'darwin') {
    app.dock?.hide();
  }

  const { createOverlayWindow } = await import('./overlayWindow');
  overlayWin = createOverlayWindow();
  createTray();
  registerIpcHandlers();

  const config = getConfig();
  if (!config.deepgramApiKey || !config.openaiApiKey) {
    const { openSettingsWindow } = await import('./settingsWindow');
    openSettingsWindow();
  } else {
    await ensureRagBuilt();
  }
});

app.on('window-all-closed', () => {
  // Keep running in the tray; only quit via the tray menu.
});

app.on('before-quit', () => {
  deepgram?.stop();
});
