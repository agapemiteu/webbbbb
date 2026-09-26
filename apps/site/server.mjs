import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';

const siteRoot = resolve(import.meta.dirname);
const demoRoot = resolve(import.meta.dirname, '../demo');
const port = Number(process.env.PORT || 4174);
const mime = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
};

createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const isDemo = pathname === '/demo' || pathname.startsWith('/demo/');
    const root = isDemo ? demoRoot : siteRoot;
    const relative = isDemo ? pathname.replace(/^\/demo\/?/, '') : pathname.slice(1);
    const file = relative === '' || relative.endsWith('/') ? `${relative}index.html` : relative;
    const path = resolve(root, file);
    if (!path.startsWith(root + sep)) {
      response.writeHead(403).end('Forbidden');
      return;
    }
    const body = await readFile(path);
    response.writeHead(200, {
      'Content-Type': mime[extname(path)] || 'application/octet-stream',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    response.end(body);
  } catch (error) {
    response.writeHead(error?.code === 'ENOENT' ? 404 : 500).end('Page unavailable');
  }
}).listen(port, '127.0.0.1', () => {
  process.stdout.write(`Webb site: http://127.0.0.1:${port}\n`);
  process.stdout.write(`Acme Cloud: http://127.0.0.1:${port}/demo/\n`);
  process.stdout.write(`Tutorial: http://127.0.0.1:${port}/demo/tutorial.html\n`);
});
