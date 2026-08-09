interface OverlayApi {
  platform: string;
  getAudioSourceId: () => Promise<string | null>;
  startAudio: () => void;
  stopAudio: () => void;
  sendAudioChunk: (chunk: ArrayBuffer) => void;
  sendManualQuestion: (text: string) => void;
  onTranscriptPartial: (cb: (text: string) => void) => void;
  onTranscriptFinal: (cb: (text: string) => void) => void;
  onAnswerChunk: (cb: (token: string) => void) => void;
  onAnswerDone: (cb: () => void) => void;
  onAnswerError: (cb: (message: string) => void) => void;
  onStatus: (cb: (status: string) => void) => void;
  onDocsIngestStatus: (cb: (status: string) => void) => void;
  hideOverlay: () => void;
  openSettings: () => void;
  quit: () => void;
}

interface Window {
  overlayApi: OverlayApi;
}

const micStatusEl = document.getElementById('micStatus') as HTMLSpanElement;
const docsStatusEl = document.getElementById('docsStatus') as HTMLSpanElement;
const transcriptEl = document.getElementById('transcript') as HTMLDivElement;
const answerEl = document.getElementById('answer') as HTMLDivElement;
const manualInput = document.getElementById('manualInput') as HTMLInputElement;
const manualSend = document.getElementById('manualSend') as HTMLButtonElement;

const MIC_STATUS_LABELS: Record<string, string> = {
  connecting: '\u{1F3A4} connecting to Deepgram...',
  listening: '\u{1F3A4} listening',
  reconnecting: '\u{1F3A4} reconnecting...',
  error: '⚠️ mic/Deepgram error -- check Settings',
  stopped: '\u{1F3A4} stopped',
};

function setStatus(status: string) {
  micStatusEl.textContent = MIC_STATUS_LABELS[status] ?? `\u{1F3A4} ${status}`;
  micStatusEl.classList.remove('listening', 'error');
  if (status === 'listening') micStatusEl.classList.add('listening');
  if (status === 'error') micStatusEl.classList.add('error');
}

function setDocsStatus(text: string) {
  docsStatusEl.textContent = text;
}

function setPartialTranscript(text: string) {
  transcriptEl.innerHTML = '';
  const span = document.createElement('span');
  span.className = 'partial';
  span.textContent = text;
  transcriptEl.appendChild(span);
}

function setFinalTranscript(text: string) {
  transcriptEl.textContent = text;
  answerEl.textContent = '';
  answerEl.classList.remove('error');
}

function appendAnswerToken(token: string) {
  answerEl.textContent += token;
}

function showAnswerError(message: string) {
  answerEl.textContent = message;
  answerEl.classList.add('error');
}

function startRecording(audioStream: MediaStream) {
  const recorder = new MediaRecorder(audioStream, { mimeType: 'audio/webm;codecs=opus' });
  recorder.ondataavailable = async (event) => {
    if (event.data.size > 0) {
      const buffer = await event.data.arrayBuffer();
      window.overlayApi.sendAudioChunk(buffer);
    }
  };
  recorder.start(250);
  window.overlayApi.startAudio();
}

async function initCaptureWindows() {
  setStatus('requesting audio source...');
  const sourceId = await window.overlayApi.getAudioSourceId();
  if (!sourceId) {
    setStatus('no audio source found');
    return;
  }

  const constraints = {
    audio: {
      mandatory: {
        chromeMediaSource: 'desktop',
      },
    },
    video: {
      mandatory: {
        chromeMediaSource: 'desktop',
        chromeMediaSourceId: sourceId,
      },
    },
  } as unknown as MediaStreamConstraints;

  const stream = await navigator.mediaDevices.getUserMedia(constraints);
  stream.getVideoTracks().forEach((track) => track.stop());
  const audioStream = new MediaStream(stream.getAudioTracks());

  if (audioStream.getAudioTracks().length === 0) {
    setStatus('no system audio track captured (Windows loopback only)');
    return;
  }

  startRecording(audioStream);
}

async function findBlackHoleDeviceId(): Promise<string | null> {
  const devices = await navigator.mediaDevices.enumerateDevices();
  const match = devices.find((d) => d.kind === 'audioinput' && /blackhole/i.test(d.label));
  return match?.deviceId ?? null;
}

async function initCaptureMac() {
  setStatus('checking for BlackHole...');

  // Device labels are blank until the app has mic permission at least once.
  try {
    const probe = await navigator.mediaDevices.getUserMedia({ audio: true });
    probe.getTracks().forEach((track) => track.stop());
  } catch (err) {
    console.error('Microphone permission denied:', err);
    setStatus('microphone permission denied -- required to detect BlackHole');
    return;
  }

  const blackHoleId = await findBlackHoleDeviceId();
  if (!blackHoleId) {
    setStatus('BlackHole not found -- install it for live listening (see README)');
    return;
  }

  const audioStream = await navigator.mediaDevices.getUserMedia({
    audio: {
      deviceId: { exact: blackHoleId },
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
    },
  });

  startRecording(audioStream);
}

async function initCapture() {
  try {
    if (window.overlayApi.platform === 'darwin') {
      await initCaptureMac();
    } else {
      await initCaptureWindows();
    }
  } catch (err) {
    console.error('Audio capture failed:', err);
    setStatus(`audio capture failed: ${(err as Error).message}`);
  }
}

window.overlayApi.onStatus((status) => setStatus(status));
window.overlayApi.onDocsIngestStatus((status) => setDocsStatus(status));
window.overlayApi.onTranscriptPartial((text) => setPartialTranscript(text));
window.overlayApi.onTranscriptFinal((text) => setFinalTranscript(text));
window.overlayApi.onAnswerChunk((token) => appendAnswerToken(token));
window.overlayApi.onAnswerDone(() => {
  /* answer complete; nothing extra to do */
});
window.overlayApi.onAnswerError((message) => showAnswerError(message));

document.getElementById('settingsBtn')?.addEventListener('click', () => window.overlayApi.openSettings());
document.getElementById('hideBtn')?.addEventListener('click', () => window.overlayApi.hideOverlay());
document.getElementById('quitBtn')?.addEventListener('click', () => window.overlayApi.quit());

function submitManualQuestion() {
  const text = manualInput.value.trim();
  if (!text) return;
  window.overlayApi.sendManualQuestion(text);
  manualInput.value = '';
}

manualSend.addEventListener('click', submitManualQuestion);
manualInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') submitManualQuestion();
});

void initCapture();
