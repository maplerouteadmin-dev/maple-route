// The "open Maple Route when MapleStory starts" switch. The watcher (scripts/watch-maple.ps1) skips
// opening the app while this flag file exists. Served to the app at /__autostart by both servers.
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const flagPath = () => join(process.env.LOCALAPPDATA ?? process.env.HOME ?? '.', 'MapleRoute', 'autostart-off');
export const autostartEnabled = () => !existsSync(flagPath());
export function setAutostart(on) {
  const file = flagPath();
  if (on) rmSync(file, { force: true });
  else { mkdirSync(join(file, '..'), { recursive: true }); writeFileSync(file, 'Maple Route will not open with MapleStory while this file exists.\n'); }
  return autostartEnabled();
}

// Only the app's own page may change it (a request from another site carries another Origin).
export const sameOrigin = (req, port) => !req.headers.origin || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(req.headers.origin) && req.headers.origin.endsWith(`:${port}`);

// GET → { enabled }, POST {"enabled": bool} → { enabled }.
export function handleAutostart(req, res, port) {
  const reply = enabled => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ enabled })); };
  if (req.method === 'GET') { reply(autostartEnabled()); return; }
  if (req.method !== 'POST' || !sameOrigin(req, port)) { res.statusCode = 403; res.end(); return; }
  let body = '';
  req.on('data', chunk => { body += chunk; if (body.length > 200) req.destroy(); });
  req.on('end', () => { try { reply(setAutostart(Boolean(JSON.parse(body).enabled))); } catch { res.statusCode = 400; res.end(); } });
}
