type Element = { paragraph?: { elements?: { textRun?: { content?: string } }[] }; table?: { tableRows?: { tableCells?: { content?: Element[] }[] }[] } };
type Tab = { tabProperties?: { tabId?: string }; documentTab?: { body?: { content?: Element[] } }; childTabs?: Tab[] };
type Document = { revisionId?: string; tabs?: Tab[] };

export function googleDocumentTarget(value: string) {
  const url = new URL(value);
  const match = url.pathname.match(/^\/document\/(?:u\/\d+\/)?d\/([a-zA-Z0-9_-]+)(?:\/|$)/);
  if (url.protocol !== 'https:' || url.hostname !== 'docs.google.com' || !match) throw new Error('Choose an editable Google Docs document.');
  return { documentId: match[1], tabId: url.searchParams.get('tab') || undefined };
}

function tabs(items: Tab[]): Tab[] { return items.flatMap(tab => [tab, ...tabs(tab.childTabs || [])]); }
function text(items: Element[]): string {
  return items.map(item => (item.paragraph?.elements || []).map(part => part.textRun?.content || '').join('')
    + (item.table?.tableRows || []).map(row => (row.tableCells || []).map(cell => text(cell.content || [])).join('')).join('')).join('');
}
function selected(document: Document, tabId?: string) {
  const all = tabs(document.tabs || []);
  const tab = tabId ? all.find(item => item.tabProperties?.tabId === tabId) : all[0];
  if (!tab?.tabProperties?.tabId) throw new Error('The selected document tab was not found. Reload the Doc and try again.');
  return { tabId: tab.tabProperties.tabId, text: text(tab.documentTab?.body?.content || []) };
}

// Google access tokens and document content stay between this browser and Google.
export async function appendGoogleDocument(url: string, value: string, token: string, request: typeof fetch = fetch) {
  const target = googleDocumentTarget(url);
  if (!value.trim() || value.length > 4000) throw new Error('Document text must be between 1 and 4,000 characters.');
  const endpoint = `https://docs.googleapis.com/v1/documents/${target.documentId}`;
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  async function read() {
    const response = await request(`${endpoint}?includeTabsContent=true`, { headers, signal: AbortSignal.timeout(12000) });
    if (!response.ok) throw new Error(response.status === 401 ? 'Google authorization expired. Connect Google Docs again in Settings.' : response.status === 403 ? 'Google denied document access. Check that the connected account can edit this Doc and the Docs API is enabled.' : `Google Docs could not be read (${response.status}).`);
    return await response.json() as Document;
  }
  const before = await read();
  if (!before.revisionId) throw new Error('Google did not return an editable document revision. Nothing was appended.');
  const body = selected(before, target.tabId);
  const expected = value.replace(/\s+/g, ' ').trim();
  const occurrences = (content: string) => content.replace(/\s+/g, ' ').split(expected).length - 1;
  let response: Response;
  try {
    response = await request(`${endpoint}:batchUpdate`, {
      method: 'POST', headers, signal: AbortSignal.timeout(12000),
      body: JSON.stringify({ writeControl: { requiredRevisionId: before.revisionId }, requests: [{ insertText: { endOfSegmentLocation: { tabId: body.tabId }, text: `\n${value}` } }] }),
    });
  } catch { throw new Error('Google document input may have succeeded. Check the Doc before asking again. Webb will not retry this write.'); }
  if (!response.ok) {
    if (response.status >= 500) throw new Error('Google could not confirm document input. Check the Doc before asking again.');
    throw new Error(`Google rejected the document update (${response.status}). Nothing was appended; review access or document changes before retrying.`);
  }
  try {
    const after = selected(await read(), body.tabId);
    if (occurrences(after.text) > occurrences(body.text)) return;
  } catch { /* A successful write must not be repeated after uncertain verification. */ }
  throw new Error('Google accepted the update, but Webb could not verify the appended text. Check the Doc before asking again.');
}
