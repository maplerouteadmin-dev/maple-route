// Where OSMS files come from. On this PC (the app's own server or the dev server) they go through the
// local relay, which saves them to disk and retries when OSMS is busy. As a public website (GitHub
// Pages and the like) the player's browser loads them straight from OSMS, which allows that
// (Access-Control-Allow-Origin: *), and public/sw.js keeps a copy in the player's browser.
export const OSMS = 'https://osmsdataexplorer.com/data/';

export const isLocalHost = (host = globalThis.location?.hostname ?? '') => host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host.endsWith('.localhost');

// `current/...` paths (mini map pictures, lists) and `maps/...` (full renders).
export function osmsUrl(path, local = isLocalHost()) {
  const clean = String(path).replace(/^\/+/, '');
  if (!local) return `${OSMS}${clean}`;
  return clean.startsWith('current/') ? `/osms-img/${clean.slice('current/'.length)}` : `/osms-data/${clean}`;
}
