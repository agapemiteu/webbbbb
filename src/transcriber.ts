import { browser } from 'wxt/browser';
import type { TranscriptTurn } from './protocol';

type Source = TranscriptTurn['source'];

export class Transcriber {
  private socket: WebSocket | null = null;
  private context: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private processor: AudioWorkletNode | null = null;

  constructor(private readonly source: Source, private readonly onTurn: (turn: TranscriptTurn) => void) {}

  async start(stream: MediaStream, apiBase: string, playThrough = false): Promise<void> {
    this.stream = stream;
    const tokenResponse = await fetch(`${apiBase.replace(/\/$/, '')}/assemblyai-token`);
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
    socket.onmessage = event => {
      try {
        const message = JSON.parse(event.data) as { type?: string; transcript?: string; end_of_turn?: boolean };
        if (message.type === 'Turn' && message.transcript?.trim()) {
          this.onTurn({ source: this.source, text: message.transcript.trim(), timestamp: Date.now(), final: message.end_of_turn === true });
        }
      } catch { /* Ignore unfamiliar server messages. */ }
    };

    await new Promise<void>((resolve, reject) => {
      socket.onopen = () => resolve();
      socket.onerror = () => reject(new Error('AssemblyAI connection failed'));
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
  }

  async stop(): Promise<void> {
    if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify({ type: 'Terminate' }));
    this.socket?.close();
    this.processor?.disconnect();
    this.stream?.getTracks().forEach(track => track.stop());
    await this.context?.close();
    this.socket = null;
    this.context = null;
    this.stream = null;
    this.processor = null;
  }
}
