// Serves the built app (dist/) on http://localhost:5174 with the same OSMS relays as the dev server,
// so the desktop shortcut works without Vite or Claude running. Nothing but OSMS is contacted.
// Usage: node scripts/serve.mjs [port]
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { handleAutostart } from './autostart.mjs';
import { handleRelay } from './osmscache.mjs';

const root = resolve(fileURLToPath(new URL('../dist/', import.meta.url)));
const port = Number(process.argv[2]) || 5174;
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.wasm': 'application/wasm', '.gz': 'application/gzip', '.ico': 'image/x-icon', '.traineddata': 'application/octet-stream' };

// Same rewrites as vite.config.js: /osms-img → data/current, /osms-data → data.
export function relayTarget(path) {
  if (path.startsWith('/osms-img/')) return `https://osmsdataexplorer.com/data/current/${path.slice('/osms-img/'.length)}`;
  if (path.startsWith('/osms-data/')) return `https://osmsdataexplorer.com/data/${path.slice('/osms-data/'.length)}`;
  return null;
}

// A file inside dist/, or null for anything that tries to leave it.
export function staticPath(base, urlPath) {
  const clean = normalize(decodeURIComponent(urlPath.split('?')[0])).replace(/^([/\\])+/, '');
  const full = join(base, clean || 'index.html');
  return full.startsWith(base) ? full : null;
}

async function handle(req, res, { enableAutostart = process.platform === 'win32' } = {}) {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/__autostart') {
    if (!enableAutostart) { res.writeHead(404); res.end(); return; }
    handleAutostart(req, res, Number(req.socket.localPort)); return;
  }
  if (req.method === 'POST' && url.pathname === '/__live-log') { req.resume(); res.end('ok'); return; } // dev-only logger: ignore
  if (await handleRelay(req, res)) return; // OSMS pictures/renders/lists, saved on this PC
  let file = staticPath(root, url.pathname);
  if (!file) { res.writeHead(403); res.end(); return; }
  try { if ((await stat(file)).isDirectory()) file = join(file, 'index.html'); } catch { file = join(root, 'index.html'); }
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
    res.end(body);
  } catch { res.writeHead(404); res.end('Not found'); }
}

export function startServer({ port: listenPort = port, host = '127.0.0.1', enableAutostart = process.platform === 'win32' } = {}) {
  const server = createServer((req, res) => {
    handle(req, res, { enableAutostart }).catch(() => { if (!res.headersSent) res.writeHead(500); res.end(); });
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(listenPort, host, () => {
      server.off('error', reject);
      const address = server.address();
      resolve({ server, url: `http://${host}:${address.port}` });
    });
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  startServer().then(({ url }) => console.log(`Maple Route on ${url}`)).catch(error => {
    console.error(error); process.exitCode = 1;
  });
}
