import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';

const root = resolve('.output/chrome-mv3');
const mock = `<script>
const event = { addListener() {}, removeListener() {} };
globalThis.chrome = {
  runtime: { id: 'webb-preview', onMessage: event, sendMessage: async () => ({ ok: false, error: 'Preview only' }), getURL: path => path },
  storage: { local: { get: async () => ({}), set: async () => {} } },
  tabs: {
    query: async () => [
      { id: 1, title: 'Deploying an application | Tutorial', url: 'http://127.0.0.1:4173/tutorial.html' },
      { id: 2, title: 'Acme Cloud | Project settings', url: 'http://127.0.0.1:4173/#settings' },
    ],
    onActivated: event, onUpdated: event, sendMessage: async (_id, request) => ({ ok: true, detail: 'Preview', snapshot: {
      url: 'http://127.0.0.1:4173/#deployments', title: 'Acme Cloud | Deployments',
      elements: [{ id: 'el_1', role: 'button', tag: 'button', text: 'Deploy production' }],
    } }),
  },
};
globalThis.fetch = async (input, init) => {
  const url = String(input);
  if (url.endsWith('/session') && init?.method === 'POST') return Response.json({ sessionId: 'preview-session' }, { status: 201 });
  if (url.includes('/session/preview-session')) return Response.json({ revision: 1 });
  if (url.endsWith('/plan')) return Response.json({ kind: 'instruction', reason: 'Deploy requested', confidence: 0.98, goal: 'Deploy application', action: { id: 'action-1', type: 'click', target: 'el_1', risk: 'confirm' } });
  return Response.json({ error: 'Preview only' }, { status: 404 });
};
</script>`;
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };

createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const path = resolve(root, pathname.slice(1) || 'sidepanel.html');
    if (!path.startsWith(root + sep)) { response.writeHead(403).end(); return; }
    let body = await readFile(path);
    if (path.endsWith('sidepanel.html')) body = Buffer.from(body.toString().replace('</head>', `${mock}</head>`));
    response.writeHead(200, { 'Content-Type': mime[extname(path)] || 'application/octet-stream', 'Cache-Control': 'no-store' }).end(body);
  } catch { response.writeHead(404).end(); }
}).listen(4184, '127.0.0.1', () => process.stdout.write('Panel preview: http://127.0.0.1:4184/sidepanel.html\n'));
