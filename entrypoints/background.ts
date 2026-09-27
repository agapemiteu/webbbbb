import { browser } from 'wxt/browser';
import { videoSource } from '../src/skill-model';
import { beginVideoRun } from '../src/skillbook';

async function startCapture(tabId: number, apiBase: string, streamId: string) {
  if (!await browser.offscreen.hasDocument()) {
    await browser.offscreen.createDocument({ url: '/offscreen.html', reasons: ['USER_MEDIA', 'AUDIO_PLAYBACK'], justification: 'Transcribe the tutorial tab while preserving its sound' });
  }
  const result = await browser.runtime.sendMessage({ type: 'START_FOLLOW', streamId, apiBase }) as { ok?: boolean; error?: string };
  if (result?.ok) await browser.storage.local.set({ webbActiveFollow: tabId });
  return result;
}

export default defineBackground(() => {
  browser.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  browser.runtime.onMessage.addListener((message: { type?: string; tabId?: number; apiBase?: string; autoStart?: boolean }, sender) => {
    if (message.type === 'VIDEO_FOLLOW_INTENT') {
      const tabId = sender.tab?.id;
      const source = videoSource(sender.tab?.title || 'Video tutorial', sender.tab?.url || '');
      if (!tabId || !source) return Promise.resolve({ ok: false, error: 'Open Webb from the Chrome toolbar.' });
      const opening = browser.sidePanel.open({ tabId });
      const stream = message.autoStart ? browser.tabCapture.getMediaStreamId({ targetTabId: tabId }) : null;
      return (async () => {
        await browser.storage.local.set({ webbFollowSuggestion: { tabId, source, createdAt: Date.now() } });
        let started = false;
        if (stream) {
          try {
            const saved = await browser.storage.local.get(['privacyConsentVersion', 'webbAutoMode', 'apiBase']);
            if (saved.privacyConsentVersion === '1' && saved.webbAutoMode === true) {
              const apiBase = typeof saved.apiBase === 'string' ? saved.apiBase : 'https://webb-api.collins-coordinator-worker.workers.dev';
              const result = await startCapture(tabId, apiBase, await stream);
              if (result?.ok) { await beginVideoRun(source); started = true; }
            }
          } catch { /* The panel keeps the manual FOLLOW action available. */ }
        }
        await opening;
        return { ok: true, started };
      })().catch(() => ({ ok: false, error: 'Open Webb from the Chrome toolbar.' }));
    }
    if (message.type !== 'CAPTURE_TAB' || !message.tabId || !message.apiBase) return;
    const stream = browser.tabCapture.getMediaStreamId({ targetTabId: message.tabId });
    return (async () => {
      return startCapture(message.tabId!, message.apiBase!, await stream);
    })();
  });
});
