import { browser } from 'wxt/browser';
import { Transcriber } from '../../src/transcriber';

let followed: Transcriber | null = null;

browser.runtime.onMessage.addListener((message: { type?: string; streamId?: string; apiBase?: string }) => {
  if (message.type === 'STOP_FOLLOW') {
    return (async () => {
      await followed?.stop();
      followed = null;
      return { ok: true };
    })();
  }
  if (message.type !== 'START_FOLLOW' || !message.streamId || !message.apiBase) return;
  return (async () => {
    await followed?.stop();
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { mandatory: { chromeMediaSource: 'tab', chromeMediaSourceId: message.streamId } } as MediaTrackConstraints,
      video: false,
    });
    followed = new Transcriber('followed_tab', turn => browser.runtime.sendMessage({ type: 'TRANSCRIPT', turn }).catch(() => {}));
    try {
      await followed.start(stream, message.apiBase!, true);
      return { ok: true };
    } catch (error) {
      await followed.stop().catch(() => {});
      followed = null;
      return { ok: false, error: error instanceof Error ? error.message : 'Failed to follow tab' };
    }
  })();
});
