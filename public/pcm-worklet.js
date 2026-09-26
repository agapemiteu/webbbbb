class PcmWorklet extends AudioWorkletProcessor {
  constructor() {
    super();
    this.inputIndex = 0;
    this.nextOutputIndex = 0;
    this.previous = 0;
    this.chunk = new Int16Array(1600);
    this.used = 0;
  }

  process(inputs) {
    const channel = inputs[0]?.[0];
    if (!channel) return true;
    const step = sampleRate / 16000;
    for (const sample of channel) {
      while (this.nextOutputIndex <= this.inputIndex) {
        const fraction = this.nextOutputIndex - (this.inputIndex - 1);
        const interpolated = this.previous + (sample - this.previous) * Math.max(0, fraction);
        const clamped = Math.max(-1, Math.min(1, interpolated));
        this.chunk[this.used++] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
        if (this.used === this.chunk.length) {
          this.port.postMessage(this.chunk.buffer, [this.chunk.buffer]);
          this.chunk = new Int16Array(1600);
          this.used = 0;
        }
        this.nextOutputIndex += step;
      }
      this.previous = sample;
      this.inputIndex++;
    }
    return true;
  }
}

registerProcessor('webb-pcm', PcmWorklet);
