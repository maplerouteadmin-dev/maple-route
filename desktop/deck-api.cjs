const { createServer } = require('node:http');

async function startDeckApi({ status, start, stop, overlay, port = 5179 }) {
  const server = createServer(async (req, res) => {
    const path = new URL(req.url, 'http://127.0.0.1').pathname;
    res.setHeader('cache-control', 'no-store');
    res.setHeader('content-type', 'application/json');
    if (req.method === 'GET' && path === '/status') {
      res.end(JSON.stringify(status())); return;
    }
    // A browser form cannot supply this header. Only the local Decky backend
    // should start capture; the phone uses its own token-protected LAN route.
    if (req.headers['x-maple-decky'] !== '1') { res.writeHead(403); res.end('{}'); return; }
    try {
      if (req.method === 'POST' && path === '/start') { start(); res.end(JSON.stringify({ ok: true })); return; }
      if (req.method === 'POST' && path === '/stop') { stop(); res.end(JSON.stringify({ ok: true })); return; }
      if (req.method === 'POST' && path === '/overlay') {
        let body = '';
        for await (const chunk of req) { body += chunk; if (body.length > 1024) { res.writeHead(413); res.end('{}'); return; } }
        const value = JSON.parse(body || '{}');
        await overlay(Boolean(value.enabled), require('./deck-overlay.cjs').overlayPosition(value.position));
        res.end(JSON.stringify({ ok: true })); return;
      }
      res.writeHead(404); res.end('{}');
    } catch { res.writeHead(400); res.end('{}'); }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
  return server;
}

module.exports = { startDeckApi };
