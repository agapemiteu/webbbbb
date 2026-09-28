import { browser } from 'wxt/browser';
import { appendGoogleDocument } from './google-docs-client';

const CONNECTION_KEY = 'webbGoogleDocsEnabled';
export function googleDocsConfigured() { return !!browser.runtime.getManifest().oauth2?.client_id; }
export async function googleDocsConnected(): Promise<boolean> {
  if (!googleDocsConfigured() || !(await browser.storage.local.get(CONNECTION_KEY))[CONNECTION_KEY]) return false;
  try { return !!(await browser.identity.getAuthToken({ interactive: false })).token; }
  catch { return false; }
}
export async function disconnectGoogleDocs(): Promise<void> {
  await browser.storage.local.set({ [CONNECTION_KEY]: false });
  // Clearing the extension's cached tokens prevents further API access from Webb.
  // Google grant revocation is separately available in the account permissions page.
  await browser.identity.clearAllCachedAuthTokens();
}
export async function connectGoogleDocs() {
  if (!googleDocsConfigured()) throw new Error('Google Docs connection needs a Google OAuth client configured for this Webb build. See docs/GOOGLE_DOCS.md.');
  const result = await browser.identity.getAuthToken({ interactive: true });
  if (!result.token) throw new Error('Google Docs access was not granted.');
  await browser.storage.local.set({ [CONNECTION_KEY]: true });
}
export async function appendGoogleDocs(tabId: number, text: string) {
  if (!googleDocsConfigured()) throw new Error('Google Docs is not connected in this build. Configure Google OAuth, then connect it in Settings.');
  if (!(await browser.storage.local.get(CONNECTION_KEY))[CONNECTION_KEY]) throw new Error('Connect Google Docs in Webb Settings before writing.');
  const result = await browser.identity.getAuthToken({ interactive: false });
  if (!result.token) throw new Error('Connect Google Docs in Webb Settings before writing.');
  const tab = await browser.tabs.get(tabId);
  try { await appendGoogleDocument(tab.url || '', text, result.token); }
  catch (error) {
    if (error instanceof Error && error.message.includes('authorization expired')) await browser.identity.removeCachedAuthToken({ token: result.token });
    throw error;
  }
}
