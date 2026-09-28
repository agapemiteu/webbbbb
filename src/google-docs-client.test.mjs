import test from 'node:test';
import assert from 'node:assert/strict';
import { appendGoogleDocument, googleDocumentTarget } from './google-docs-client.ts';

const document = (text, revision = 'r1') => ({ revisionId: revision, tabs: [{ tabProperties: { tabId: 't.0' }, documentTab: { body: { content: [{ paragraph: { elements: [{ textRun: { content: text } }] } }] } } }] });
test('Google document targeting rejects lookalike hosts and preserves the selected document tab', () => {
  assert.throws(() => googleDocumentTarget('https://docs.google.com.evil.test/document/d/test/edit'));
  assert.throws(() => googleDocumentTarget('http://docs.google.com/document/d/test/edit'));
  assert.deepEqual(googleDocumentTarget('https://docs.google.com/document/d/test/edit?tab=t.0'), { documentId: 'test', tabId: 't.0' });
});
test('Docs append binds a revision and tab, preserves existing text, and verifies new occurrences', async () => {
  const calls = [];
  let reads = 0;
  await appendGoogleDocument('https://docs.google.com/document/d/test/edit?tab=t.0', 'Note', 'test-token', async (url, options) => {
    calls.push({ url, options });
    return Response.json(options.method === 'POST' ? {} : document(reads++ ? 'Note\nExisting paragraph.\nNote' : 'Note\nExisting paragraph.'));
  });
  const write = JSON.parse(calls.find(call => call.options.method === 'POST').options.body);
  assert.deepEqual(write.writeControl, { requiredRevisionId: 'r1' });
  assert.deepEqual(write.requests, [{ insertText: { endOfSegmentLocation: { tabId: 't.0' }, text: '\nNote' } }]);
  assert.equal(calls.filter(call => call.options.method === 'POST').length, 1);
});
test('Docs append stops before writing when Google denies access or the tab is missing', async () => {
  for (const response of [new Response('', { status: 403 }), Response.json(document('Original'))]) {
    let writes = 0;
    await assert.rejects(appendGoogleDocument('https://docs.google.com/document/d/test/edit?tab=missing', 'Note', 'test-token', async (_, options) => { if (options.method === 'POST') writes++; return response; }));
    assert.equal(writes, 0);
  }
});
test('Docs append never retries a write after a connection failure or unverifiable result', async () => {
  for (const failWrite of [true, false]) {
    let writes = 0;
    await assert.rejects(appendGoogleDocument('https://docs.google.com/document/d/test/edit', 'Note', 'test-token', async (_, options) => {
      if (options.method === 'POST') { writes++; if (failWrite) throw new Error('connection closed'); return Response.json({}); }
      return Response.json(document('Original'));
    }), /Check the Doc/);
    assert.equal(writes, 1);
  }
});
