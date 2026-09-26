import { browser } from 'wxt/browser';

export default defineBackground(() => {
  browser.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  browser.runtime.onMessage.addListener((message: { type?: string; tabId?: number; apiBase?: string }) => {
    if (message.type !== 'CAPTURE_TAB' || !message.tabId || !message.apiBase) return;
    return (async () => {
      if (!await browser.offscreen.hasDocument()) {
        await browser.offscreen.createDocument({ url: '/offscreen.html', reasons: ['USER_MEDIA', 'AUDIO_PLAYBACK'], justification: 'Transcribe the tutorial tab while preserving its sound' });
      }
      const streamId = await browser.tabCapture.getMediaStreamId({ targetTabId: message.tabId });
      return browser.runtime.sendMessage({ type: 'START_FOLLOW', streamId, apiBase: message.apiBase });
    })();
  });
});
