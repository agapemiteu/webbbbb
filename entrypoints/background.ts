import { browser } from 'wxt/browser';
import { videoSource } from '../src/skill-model';
import { beginVideoRun } from '../src/skillbook';

type PendingFollow = { tabId: number; apiBase: string; source: NonNullable<ReturnType<typeof videoSource>>; requestedAt: number };
type FollowPhase = { tabId: number; step: 'toolbar' | 'capturing' | 'connected' | 'error'; detail?: string; updatedAt: number };
const FOLLOW_TIMEOUT_MS = 2 * 60_000;

async function reportFollow(tabId: number, step: FollowPhase['step'], detail?: string) {
  await browser.storage.local.set({ webbFollowPhase: { tabId, step, detail, updatedAt: Date.now() } satisfies FollowPhase });
}

async function ensureContentScript(tabId: number) {
  try { await browser.tabs.sendMessage(tabId, { type: 'INSPECT' }); }
  catch { await browser.scripting.executeScript({ target: { tabId }, files: ['/content-scripts/content.js'] }); }
}

async function startCapture(tabId: number, apiBase: string, streamId: string) {
  if (!await browser.offscreen.hasDocument()) {
    await browser.offscreen.createDocument({ url: '/offscreen.html', reasons: ['USER_MEDIA', 'AUDIO_PLAYBACK'], justification: 'Transcribe the tutorial tab while preserving its sound' });
  }
  const result = await browser.runtime.sendMessage({ type: 'START_FOLLOW', streamId, apiBase }) as { ok?: boolean; error?: string };
  if (result?.ok) await browser.storage.local.set({ webbActiveFollow: tabId });
  return result;
}

export default defineBackground(() => {
  browser.action.onClicked.addListener(tab => {
    if (!tab.id) return;
    const tabId = tab.id;
    const opening = browser.sidePanel.open({ tabId }).catch(() => {});
    void (async () => {
      const saved = await browser.storage.local.get(['webbPendingFollow', 'privacyConsentVersion']);
      if (saved.privacyConsentVersion === '1' && tab.url?.startsWith('http')) void ensureContentScript(tabId).catch(() => {});
      const pending = saved.webbPendingFollow as PendingFollow | undefined;
      if (!pending || Date.now() - pending.requestedAt > FOLLOW_TIMEOUT_MS) {
        if (pending) await browser.storage.local.remove('webbPendingFollow');
        await opening;
        return;
      }
      if (pending.tabId !== tabId) {
        await reportFollow(pending.tabId, 'error', 'The toolbar click came from a different tab. Open the tutorial tab and click Webb there.');
        await browser.storage.local.set({ webbFollowNotice: 'Open the tutorial tab, then click the Webb toolbar icon there.' });
        await opening;
        return;
      }
      if (saved.privacyConsentVersion !== '1') {
        await browser.storage.local.set({ webbFollowNotice: 'Agree to the privacy disclosure before following audio.' });
        await opening;
        return;
      }
      await reportFollow(tabId, 'toolbar');
      const streamId = await browser.tabCapture.getMediaStreamId({ targetTabId: tabId });
      await reportFollow(tabId, 'capturing');
      const result = await startCapture(tabId, pending.apiBase, streamId);
      if (!result?.ok) throw new Error(result?.error || 'Tab audio could not start.');
      await beginVideoRun(pending.source);
      await reportFollow(tabId, 'connected');
      await browser.storage.local.remove('webbPendingFollow');
      await browser.storage.local.set({ webbFollowNotice: `Following ${pending.source.title}. Choose a different target tab.` });
      await opening;
    })().catch(async error => {
      const detail = error instanceof Error ? error.message : 'Tab audio could not start.';
      await reportFollow(tabId, 'error', detail);
      await browser.storage.local.set({ webbFollowNotice: `FOLLOW did not start: ${detail}. Try the Webb toolbar icon again on the tutorial tab.` });
    });
  });
  browser.runtime.onMessage.addListener((message: { type?: string; tabId?: number; apiBase?: string; autoStart?: boolean; streamId?: string; source?: PendingFollow['source'] }, sender) => {
    if (message.type === 'CAPTURE_FOLLOW' && sender.id === browser.runtime.id) {
      return (async () => {
        if (!message.tabId || !message.apiBase || !message.streamId || !message.source) return { ok: false, error: 'Missing capture details.' };
        const result = await startCapture(message.tabId, message.apiBase, message.streamId);
        if (!result?.ok) return { ok: false, error: result?.error || 'Tab audio could not start.' };
        await beginVideoRun(message.source);
        await reportFollow(message.tabId, 'connected');
        await browser.storage.local.remove('webbPendingFollow');
        return { ok: true };
      })().catch(error => ({ ok: false, error: error instanceof Error ? error.message : 'Tab audio could not start.' }));
    }
    if (message.type === 'VIDEO_FOLLOW_INTENT') {
      const tabId = sender.tab?.id;
      const source = videoSource(sender.tab?.title || 'Video tutorial', sender.tab?.url || '');
      if (!tabId || !source) return Promise.resolve({ ok: false, error: 'Open Webb from the Chrome toolbar.' });
      const opening = browser.sidePanel.open({ tabId });
      return (async () => {
        await browser.storage.local.set({ webbFollowSuggestion: { tabId, source, createdAt: Date.now() } });
        if (message.autoStart) {
          const saved = await browser.storage.local.get(['privacyConsentVersion', 'webbAutoMode', 'apiBase']);
          if (saved.privacyConsentVersion === '1' && saved.webbAutoMode === true) {
            const apiBase = typeof saved.apiBase === 'string' ? saved.apiBase : 'https://webb-api.collins-coordinator-worker.workers.dev';
            await browser.storage.local.remove('webbFollowNotice');
            await browser.storage.local.set({ webbPendingFollow: { tabId, apiBase, source, requestedAt: Date.now() } satisfies PendingFollow });
          }
        }
        await opening;
        return { ok: true };
      })().catch(() => ({ ok: false, error: 'Open Webb from the Chrome toolbar.' }));
    }
  });
});
