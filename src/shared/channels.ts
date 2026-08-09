export const CHANNELS = {
  audioGetSourceId: 'audio:get-source-id',
  audioStart: 'audio:start',
  audioStop: 'audio:stop',
  audioChunk: 'audio:chunk',

  transcriptPartial: 'transcript:partial',
  transcriptFinal: 'transcript:final',

  answerChunk: 'answer:chunk',
  answerDone: 'answer:done',
  answerError: 'answer:error',

  statusUpdate: 'status:update',

  questionManual: 'question:manual',

  settingsGet: 'settings:get',
  settingsSave: 'settings:save',
  settingsPickDocFolder: 'settings:pick-doc-folder',
  docsReingest: 'docs:reingest',
  docsIngestStatus: 'docs:ingest-status',

  windowHideOverlay: 'window:hide-overlay',
  windowOpenSettings: 'window:open-settings',
  windowQuit: 'window:quit',
} as const;
