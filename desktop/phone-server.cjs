const { createServer } = require('node:http');
const { networkInterfaces } = require('node:os');
const { randomBytes, timingSafeEqual } = require('node:crypto');
const { readFile, readdir } = require('node:fs/promises');
const { join } = require('node:path');
const QRCode = require('qrcode');

function privateIpv4(address) {
  const octets = address?.split('.').map(Number);
  if (octets?.length !== 4 || octets.some(n => !Number.isInteger(n) || n < 0 || n > 255)) return false;
  return octets[0] === 10 || (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) || (octets[0] === 192 && octets[1] === 168);
}

// The address a phone on the same Wi-Fi can reach: a private IPv4 on a real network (not a /32
// point-to-point link such as a dock or VPN interface), Wi-Fi first, then wired.
function lanAddress(interfaces = networkInterfaces()) {
  const candidates = [];
  for (const [name, entries] of Object.entries(interfaces))
    for (const entry of entries ?? [])
      if (entry.family === 'IPv4' && !entry.internal && privateIpv4(entry.address) && entry.netmask !== '255.255.255.255')
        candidates.push({ name, address: entry.address, rank: /^(wlan|wl|wi-?fi)/i.test(name) ? 0 : /^(eth|en)/i.test(name) ? 1 : 2 });
  candidates.sort((a, b) => a.rank - b.rank);
  return candidates[0]?.address ?? null;
}

function tokenMatches(given, expected) {
  if (!given || typeof given !== 'string' || given.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(given), Buffer.from(expected));
}

function safeAction(value) {
  if (!value || typeof value !== 'object' || !['click', 'input', 'change'].includes(value.kind)) return false;
  if (!Array.isArray(value.path) || value.path.length < 1 || value.path.length > 30 || value.path.some(n => !Number.isInteger(n) || n < 0 || n > 500)) return false;
  if (value.value != null && (typeof value.value !== 'string' || value.value.length > 512)) return false;
  if (typeof value.tag !== 'string' || !/^[A-Z]{1,12}$/.test(value.tag)) return false;
  if (value.id != null && (typeof value.id !== 'string' || value.id.length > 100)) return false;
  return true;
}

async function startPhoneServer({ localOrigin, port = 5178, onAction, onStart, onStop, onOverlay, token: savedToken = null }) {
  const host = lanAddress();
  if (!host) throw new Error('No private Wi-Fi/LAN address is available. Phone sharing stays off.');
  // Kept between restarts (by the caller) so a phone's saved link keeps working on this network.
  const token = typeof savedToken === 'string' && /^[0-9a-f]{48}$/.test(savedToken) ? savedToken : randomBytes(24).toString('hex');
  const base = `http://${host}:${port}`;
  const url = `${base}/phone?t=${token}`;
  const qr = await QRCode.toString(url, { type: 'svg', width: 240, margin: 1 });
  const clients = new Set();
  let snapshot = { bodyClass: '', html: '', status: { state: 'off' }, overlay: false, overlayPosition: 'bottom-right' };
  const dist = join(__dirname, '..', 'dist');
  const assetNames = (await readdir(join(dist, 'assets'))).filter(name => /^index-[\w-]+\.css$/.test(name));
  const css = assetNames.length ? await readFile(join(dist, 'assets', assetNames[0])) : Buffer.alloc(0);
  function send(res, value) { res.write(`data: ${JSON.stringify(value)}\n\n`); }
  function publish(next) {
    snapshot = { ...snapshot, ...next };
    for (const client of clients) send(client, snapshot);
  }
  const server = createServer(async (req, res) => {
    const request = new URL(req.url, base);
    const cookies = Object.fromEntries((req.headers.cookie ?? '').split(';').map(s => s.trim().split('=')));
    const authorized = tokenMatches(request.searchParams.get('t'), token) || tokenMatches(cookies['maple-phone'], token);
    if (!authorized) { res.writeHead(403); res.end('Access denied'); return; }
    res.setHeader('cache-control', 'no-store');
    res.setHeader('x-content-type-options', 'nosniff');
    if (req.method === 'GET' && request.pathname === '/phone') {
      res.setHeader('set-cookie', `maple-phone=${token}; HttpOnly; SameSite=Strict; Path=/`);
      res.setHeader('content-type', 'text/html; charset=utf-8');
      res.setHeader('content-security-policy', "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; media-src 'self'; img-src 'self' data: https:; font-src 'self' data:; frame-src 'none'");
      res.end(`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Maple Route on your phone</title><link rel="stylesheet" href="/app.css"><style>/* The Deck page is fitted to one window; on a phone it scrolls like a normal page. */html,body,body.gps-page{overflow:auto!important;height:auto!important}body.gps-page #live-plan,body.gps-page #live-step{max-height:none!important;overflow:visible!important}body.gps-page #mapview .mv-picture{max-height:55vh!important}.view.view-split{flex-direction:column}body{background:#f7f8f2}.phone-bar{position:sticky;top:0;z-index:9999;background:#123d30;color:white;padding:8px;display:flex;gap:8px;align-items:center;flex-wrap:wrap}.phone-bar button,.phone-bar select{font:inherit;border:0;border-radius:7px;padding:7px 11px}.phone-bar .warn{background:#f8d5c8}.phone-bar small{flex:1}.phone-disconnected{background:#ffe4db;color:#8b321d;padding:8px}@media(prefers-color-scheme:dark){body{background:#13231d;color:#f0f5ed}.card{background:#1d3028;color:#f0f5ed}}</style></head><body><div class="phone-bar"><small id="phone-status">Connecting…</small><button id="phone-start">Start reading</button><button id="phone-stop" class="warn">Stop</button><button id="phone-overlay">Pop-up off</button><select id="phone-position" aria-label="Pop-up position"><option value="bottom-left">Bottom left</option><option value="bottom-right">Bottom right</option><option value="upper-right">Upper right</option></select><button id="phone-voice">Phone voice off</button></div><div id="phone-disconnected" class="phone-disconnected" hidden>Connection lost. Reconnecting…</div><div id="app"></div><script src="/phone.js" defer></script></body></html>`);
      return;
    }
    if (req.method === 'GET' && request.pathname === '/phone.js') {
      res.setHeader('content-type', 'text/javascript; charset=utf-8'); res.end(await readFile(join(__dirname, 'phone.js'))); return;
    }
    // A 1.7 KB silent blank video looped by the page keeps the phone screen on (the Wake Lock API needs https).
    if (req.method === 'GET' && request.pathname === '/keepawake.mp4') {
      res.setHeader('content-type', 'video/mp4'); res.end(await readFile(join(__dirname, 'keepawake.mp4'))); return;
    }
    if (req.method === 'GET' && request.pathname === '/app.css') {
      res.setHeader('content-type', 'text/css; charset=utf-8'); res.end(css); return;
    }
    if (req.method === 'GET' && request.pathname === '/events') {
      if (clients.size >= 3) { res.writeHead(429); res.end('Three phones are already connected'); return; }
      res.writeHead(200, { 'content-type': 'text/event-stream', 'connection': 'keep-alive', 'cache-control': 'no-store' });
      clients.add(res); send(res, snapshot);
      const heartbeat = setInterval(() => res.write(': keep-alive\n\n'), 15000);
      req.on('close', () => { clearInterval(heartbeat); clients.delete(res); });
      return;
    }
    if (req.method === 'POST' && ['/action', '/start', '/stop', '/overlay'].includes(request.pathname)) {
      if (!clients.size) { res.writeHead(409); res.end('Open the phone page first'); return; }
      if (req.headers.origin && req.headers.origin !== base) { res.writeHead(403); res.end(); return; }
      let body = '';
      for await (const chunk of req) { body += chunk; if (body.length > 4096) { res.writeHead(413); res.end(); return; } }
      let value = null; try { value = body ? JSON.parse(body) : null; } catch { res.writeHead(400); res.end(); return; }
      if (request.pathname === '/action' && !safeAction(value)) { res.writeHead(400); res.end(); return; }
      try {
        if (request.pathname === '/action') onAction(value);
        if (request.pathname === '/start') onStart();
        if (request.pathname === '/stop') onStop();
        if (request.pathname === '/overlay') onOverlay(Boolean(value?.enabled), require('./deck-overlay.cjs').overlayPosition(value?.position));
        res.writeHead(202); res.end('ok');
      } catch { res.writeHead(500); res.end(); }
      return;
    }
    // Read-only images needed by the existing map SVG. No relay writes or local diagnostics.
    if (req.method === 'GET' && /^\/osms-(?:img|data)\/[\w./%-]+$/.test(request.pathname) && !request.pathname.includes('..')) {
      try {
        const upstream = await fetch(localOrigin + request.pathname);
        res.writeHead(upstream.status, { 'content-type': upstream.headers.get('content-type') ?? 'application/octet-stream' });
        res.end(Buffer.from(await upstream.arrayBuffer()));
      } catch { res.writeHead(502); res.end(); }
      return;
    }
    res.writeHead(404); res.end('Not found');
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, host, resolve); });
  return { server, url, qr, publish, clients, token };
}

module.exports = { privateIpv4, lanAddress, tokenMatches, safeAction, startPhoneServer };
