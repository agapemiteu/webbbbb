import { browser } from 'wxt/browser';
import { videoSource } from '../src/skill-model';

async function ensureContentScript(tabId: number) {
  try { await browser.tabs.sendMessage(tabId, { type: 'INSPECT' }); }
  catch { await browser.scripting.executeScript({ target: { tabId }, files: ['/content-scripts/content.js'] }); }
}

export default defineBackground(() => {
  browser.action.onClicked.addListener(tab => {
    if (!tab.id) return;
    void browser.sidePanel.open({ tabId: tab.id }).catch(() => {});
    if (tab.url?.startsWith('http')) {
      void browser.storage.local.get('privacyConsentVersion').then(saved => {
        if (saved.privacyConsentVersion === '1') return ensureContentScript(tab.id!);
      }).catch(() => {});
    }
  });

  browser.runtime.onMessage.addListener((message: { type?: string }, sender) => {
    if (message.type !== 'VIDEO_FOLLOW_INTENT') return;
    const tabId = sender.tab?.id;
    const source = videoSource(sender.tab?.title || 'Source tab', sender.tab?.url || '');
    if (!tabId || !source) return Promise.resolve({ ok: false, error: 'Open Webb on a website with audio.' });
    const opening = browser.sidePanel.open({ tabId });
    return (async () => {
      await browser.storage.local.set({ webbFollowSuggestion: { tabId, source, createdAt: Date.now() } });
      await opening;
      return { ok: true };
    })().catch(() => ({ ok: false, error: 'Open Webb from the Chrome toolbar.' }));
  });
});
