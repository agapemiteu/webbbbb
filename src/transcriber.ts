import { browser } from 'wxt/browser';
import type { TranscriptTurn } from './protocol';

type Source = TranscriptTurn['source'];

export class Transcriber {
  private socket: WebSocket | null = null;
  private context: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private processor: AudioWorkletNode | null = null;
  private stopping = false;

  constructor(
    private readonly source: Source,
    private readonly onTurn: (turn: TranscriptTurn) => void,
    private readonly onError?: (message: string) => void,
  ) {}

  async start(stream: MediaStream, apiBase: string, playThrough = false): Promise<void> {
    this.stream = stream;
    this.stopping = false;
    const tokenResponse = await fetch(`${apiBase.replace(/\/$/, '')}/assemblyai-token`, {
      headers: { 'X-Webb-Extension': browser.runtime.id },
      signal: AbortSignal.timeout(12000),
    });
    if (!tokenResponse.ok) throw new Error(`Token request failed (${tokenResponse.status})`);
    const payload = await tokenResponse.json() as { token?: string };
    if (!payload.token) throw new Error('Token endpoint returned no token');

    const url = new URL('wss://streaming.assemblyai.com/v3/ws');
    url.searchParams.set('sample_rate', '16000');
    url.searchParams.set('speech_model', 'u3-rt-pro');
    url.searchParams.set('token', payload.token);
    const socket = new WebSocket(url);
    this.socket = socket;
    socket.binaryType = 'arraybuffer';
    await new Promise<void>((resolve, reject) => {
      let connected = false;
      let reported = false;
      const timeout = setTimeout(() => reject(new Error('Speech connection timed out. Try again.')), 12000);
      const fail = (message: string) => {
        clearTimeout(timeout);
        if (!connected) reject(new Error(message));
        else if (!this.stopping && !reported) { reported = true; this.onError?.(message); }
      };
      socket.onerror = () => fail('Speech connection failed. Start listening again.');
      socket.onclose = event => fail(`Speech connection closed (${event.code}). Start listening again.`);
      socket.onmessage = event => {
        try {
          const message = JSON.parse(event.data) as { type?: string; transcript?: string; end_of_turn?: boolean };
          if (message.type === 'Begin') {
            connected = true;
            clearTimeout(timeout);
            resolve();
          } else if (message.type === 'Turn' && message.transcript?.trim()) {
            this.onTurn({ source: this.source, text: message.transcript.trim(), timestamp: Date.now(), final: message.end_of_turn === true });
          }
        } catch { /* Ignore unfamiliar server messages. */ }
      };
    });

    const context = new AudioContext();
    this.context = context;
    await context.audioWorklet.addModule(browser.runtime.getURL('/pcm-worklet.js'));
    const source = context.createMediaStreamSource(stream);
    const processor = new AudioWorkletNode(context, 'webb-pcm');
    this.processor = processor;
    processor.port.onmessage = event => {
      if (socket.readyState === WebSocket.OPEN) socket.send(event.data as ArrayBuffer);
    };
    source.connect(processor);
    processor.connect(context.destination);
    if (playThrough) source.connect(context.destination);
    await context.resume();
    if (socket.readyState !== WebSocket.OPEN || this.stopping) throw new Error('Speech connection ended before audio could start. Try again.');
  }

  async stop(): Promise<void> {
    this.stopping = true;
    if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify({ type: 'Terminate' }));
    this.socket?.close();
    this.processor?.disconnect();
    this.stream?.getTracks().forEach(track => track.stop());
    if (this.context?.state !== 'closed') await this.context?.close();
    this.socket = null;
    this.context = null;
    this.stream = null;
    this.processor = null;
  }
}
