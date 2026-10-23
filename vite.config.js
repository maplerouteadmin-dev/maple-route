import { defineConfig } from 'vite';
import { appendFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { handleAutostart } from './scripts/autostart.mjs';
import { handleRelay } from './scripts/osmscache.mjs';

// OSMS pictures are requested through same-origin paths so the browser may read their pixels:
// mini map pictures (/osms-img → data/current) and full map renders + manifest (/osms-data → data).
// Kept on this PC once downloaded and retried when OSMS is busy (scripts/osmscache.mjs).
const relay = (req, res, next) => { handleRelay(req, res).then(done => { if (!done) next(); }).catch(() => { res.statusCode = 502; res.end(); }); };

// Dev only: the app posts its Live GPS test log here so a session can be followed from this machine
// (fixtures/live/session.jsonl, gitignored). Nothing leaves the computer.
function liveLog() {
  const dir = resolve('fixtures/live'), file = resolve(dir, 'session.jsonl');
  return {
    name: 'live-log',
    configureServer(server) {
      server.middlewares.use(relay);
      server.middlewares.use('/__autostart', (req, res) => handleAutostart(req, res, server.config.server.port ?? 5174));
      server.middlewares.use('/__live-log', (req, res) => {
        if (req.method !== 'POST') { res.statusCode = 405; res.end(); return; }
        let body = '';
        req.on('data', chunk => { body += chunk; if (body.length > 2_000_000) req.destroy(); });
        req.on('end', () => {
          try { mkdirSync(dir, { recursive: true }); if (body.trim()) appendFileSync(file, `${body.trim()}\n`); res.end('ok'); }
          catch { res.statusCode = 500; res.end(); }
        });
      });
    }
  };
}

export default defineConfig({
  base: './',
  plugins: [liveLog()]
});
