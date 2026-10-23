// OSMS pictures, renders and map lists are kept on this computer once downloaded
// (%LOCALAPPDATA%\MapleRoute\cache), so a busy OSMS ("503") can never break a map picture again.
// Busy or failed downloads are retried a few times. Used by both the dev server and serve.mjs.
// This is a private cache on the player's own PC, not a copy that is shared or republished.
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, normalize } from 'node:path';

export const cacheDir = () => join(process.env.LOCALAPPDATA ?? process.env.HOME ?? '.', 'MapleRoute', 'cache');
const DAY = 24 * 60 * 60 * 1000;
const TYPES = { '.png': 'image/png', '.webp': 'image/webp', '.json': 'application/json', '.jpg': 'image/jpeg', '.gif': 'image/gif' };

// Where a relayed URL is kept on disk; null for anything that would leave the cache folder.
export function cacheFile(url, dir = cacheDir()) {
  const path = normalize(new URL(url).pathname).replace(/^([/\\])+/, '');
  const file = join(dir, path);
  return file.startsWith(dir) ? file : null;
}
// Pictures never change for a game version; lists (.json) are refreshed daily.
export const isFresh = (file, now = Date.now()) => existsSync(file) && (!file.endsWith('.json') || now - statSync(file).mtimeMs < DAY);

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
export async function fetchCached(url, { tries = 4, dir = cacheDir() } = {}) {
  const file = cacheFile(url, dir), type = TYPES[(file ?? '').slice((file ?? '').lastIndexOf('.'))] ?? 'application/octet-stream';
  if (file && isFresh(file)) return { status: 200, type, body: readFileSync(file) };
  let last = null;
  for (let attempt = 0; attempt < tries; attempt++) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        const body = Buffer.from(await response.arrayBuffer());
        if (file) { mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, body); }
        return { status: 200, type: response.headers.get('content-type') ?? type, body };
      }
      last = response.status;
      if (response.status === 404) break; // really missing: no point retrying
    } catch { last = 'network'; }
    await wait(800 * (attempt + 1) ** 2); // 0.8 s, 3.2 s, 7.2 s
  }
  // Offline or OSMS down: an older saved copy is better than nothing.
  if (file && existsSync(file)) return { status: 200, type, body: readFileSync(file) };
  return { status: typeof last === 'number' ? last : 502, type: 'text/plain', body: Buffer.from('OSMS unavailable') };
}

// /osms-img/<path> → data/current/<path>; /osms-data/<path> → data/<path> (same as before).
export function relayUrl(path) {
  if (path.startsWith('/osms-img/')) return `https://osmsdataexplorer.com/data/current/${path.slice('/osms-img/'.length)}`;
  if (path.startsWith('/osms-data/')) return `https://osmsdataexplorer.com/data/${path.slice('/osms-data/'.length)}`;
  return null;
}

// Connect-style middleware for both servers.
export async function handleRelay(req, res) {
  const url = new URL(req.url, 'http://localhost'), target = relayUrl(url.pathname);
  if (!target) return false;
  const result = await fetchCached(target + url.search);
  res.writeHead(result.status, { 'content-type': result.type, 'cache-control': 'public, max-age=3600' });
  res.end(result.body);
  return true;
}
