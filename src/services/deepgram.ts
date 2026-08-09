import { createClient, LiveTranscriptionEvents, type ListenLiveClient } from '@deepgram/sdk';

export interface DeepgramCallbacks {
  onInterim: (text: string) => void;
  onFinal: (text: string) => void;
  onStatus: (status: 'connecting' | 'listening' | 'reconnecting' | 'error' | 'stopped') => void;
}

const MAX_QUEUE = 100;
const MAX_RECONNECT_DELAY_MS = 16000;

function toArrayBuffer(buf: Buffer): ArrayBuffer {
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
}

export class DeepgramStreamer {
  private client;
  private connection: ListenLiveClient | null = null;
  private callbacks: DeepgramCallbacks;
  private reconnectAttempts = 0;
  private manuallyStopped = true;
  private queue: Buffer[] = [];
  private ready = false;
  private reconnectTimer: NodeJS.Timeout | null = null;

  constructor(apiKey: string, callbacks: DeepgramCallbacks) {
    this.client = createClient(apiKey);
    this.callbacks = callbacks;
  }

  start() {
    this.manuallyStopped = false;
    this.reconnectAttempts = 0;
    this.connect();
  }

  private connect() {
    this.callbacks.onStatus(this.reconnectAttempts > 0 ? 'reconnecting' : 'connecting');

    const connection = this.client.listen.live({
      model: 'nova-2',
      smart_format: true,
      interim_results: true,
      endpointing: 300,
      utterance_end_ms: 1000,
      vad_events: true,
    });

    connection.on(LiveTranscriptionEvents.Open, () => {
      this.ready = true;
      this.reconnectAttempts = 0;
      this.callbacks.onStatus('listening');
      while (this.queue.length) {
        const buf = this.queue.shift();
        if (buf) connection.send(toArrayBuffer(buf));
      }
    });

    connection.on(LiveTranscriptionEvents.Transcript, (data: any) => {
      const alt = data?.channel?.alternatives?.[0];
      const text: string = alt?.transcript ?? '';
      if (!text) return;
      if (data.is_final && data.speech_final) {
        this.callbacks.onFinal(text);
      } else {
        this.callbacks.onInterim(text);
      }
    });

    connection.on(LiveTranscriptionEvents.Error, (err: any) => {
      console.error('[deepgram] error:', err);
      this.callbacks.onStatus('error');
    });

    connection.on(LiveTranscriptionEvents.Close, () => {
      this.ready = false;
      if (!this.manuallyStopped) {
        this.scheduleReconnect();
      } else {
        this.callbacks.onStatus('stopped');
      }
    });

    this.connection = connection;
  }

  private scheduleReconnect() {
    this.reconnectAttempts++;
    const delay = Math.min(MAX_RECONNECT_DELAY_MS, 1000 * 2 ** (this.reconnectAttempts - 1));
    this.callbacks.onStatus('reconnecting');
    this.reconnectTimer = setTimeout(() => {
      if (!this.manuallyStopped) this.connect();
    }, delay);
  }

  sendAudio(chunk: Buffer) {
    if (this.ready && this.connection) {
      this.connection.send(toArrayBuffer(chunk));
    } else {
      this.queue.push(chunk);
      if (this.queue.length > MAX_QUEUE) this.queue.shift();
    }
  }

  stop() {
    this.manuallyStopped = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.connection?.requestClose();
    this.connection = null;
    this.ready = false;
    this.queue = [];
  }
}
