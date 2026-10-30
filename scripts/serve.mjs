// Serves the built app (dist/) on http://localhost:5174 with the same OSMS relays as the dev server,
// so the desktop shortcut works without Vite or Claude running. Nothing but OSMS is contacted.
// Usage: node scripts/serve.mjs [port]
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { handleAutostart } from './autostart.mjs';
import { handleRelay } from './osmscache.mjs';
import { createCouchHost } from './couch.mjs';
import phoneServer from '../desktop/phone-server.cjs';

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

async function handle(req, res, { enableAutostart = process.platform === 'win32', couch = null } = {}) {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname.startsWith('/__couch/')) {
    // This control plane is available only to the app on loopback, not to the phone LAN server.
    const host = req.headers.host ?? '';
    const localHost = /^(?:localhost|127\.0\.0\.1):\d+$/.test(host);
    const localPeer = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress);
    if (!couch || !localHost || !localPeer || req.headers['x-maple-couch'] !== '1') { res.writeHead(403); res.end(); return; }
    if (req.method === 'POST' && req.headers.origin !== `http://${host}`) { res.writeHead(403); res.end(); return; }
    const json = (code, value) => { res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }); res.end(JSON.stringify(value)); };
    if (req.method === 'GET' && url.pathname === '/__couch/status') { json(200, couch.status()); return; }
    if (req.method === 'GET' && url.pathname === '/__couch/actions') { json(200, couch.drain()); return; }
    if (req.method === 'POST' && url.pathname === '/__couch/enable') {
      try { json(200, await couch.enable()); } catch (error) { json(503, { error: String(error?.message ?? 'Phone sharing unavailable').slice(0, 180) }); } return;
    }
    if (req.method === 'POST' && url.pathname === '/__couch/disable') { json(200, await couch.disable()); return; }
    if (req.method === 'POST' && url.pathname === '/__couch/publish') {
      if (!req.headers['content-type']?.startsWith('application/json')) { json(415, { error: 'JSON required' }); return; }
      let body = '';
      for await (const chunk of req) { body += chunk; if (body.length > 2_100_000) { json(413, { error: 'Snapshot too large' }); return; } }
      let snapshot; try { snapshot = JSON.parse(body); } catch { json(400, { error: 'Invalid snapshot' }); return; }
      json(couch.publish(snapshot) ? 202 : 400, {}); return;
    }
    res.writeHead(404); res.end(); return;
  }
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
  let couch = null;
  const server = createServer((req, res) => {
    handle(req, res, { enableAutostart, couch }).catch(() => { if (!res.headersSent) res.writeHead(500); res.end(); });
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(listenPort, host, () => {
      server.off('error', reject);
      const address = server.address();
      const url = `http://${host}:${address.port}`;
      couch = createCouchHost({ localOrigin: url, startPhoneServer: phoneServer.startPhoneServer });
      server.on('close', () => couch.disable().catch(() => {}));
      resolve({ server, url });
    });
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  startServer().then(({ url }) => console.log(`Maple Route on ${url}`)).catch(error => {
    console.error(error); process.exitCode = 1;
  });
}
