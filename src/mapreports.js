import { MARKET_URL, MARKET_KEY } from './marketstore.js';

const SESSION_KEY = 'maple-route-report-session';
const browserStorage = {
  get(key) { try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; } },
  set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* the report can still be sent */ } }
};

export function mapReportPayload({ mapName, observedMap = '', description, version = '', platform = 'web' }) {
  const oneLine = (value, max) => String(value ?? '').replace(/[\r\n\t]+/g, ' ').trim().slice(0, max);
  const payload = {
    map_name: oneLine(mapName, 120),
    observed_map: oneLine(observedMap, 120),
    description: String(description ?? '').trim().slice(0, 500),
    version: oneLine(version, 40),
    platform: ['deck', 'web'].includes(platform) ? platform : 'web'
  };
  if (payload.map_name.length < 2) throw new Error('Enter the map name shown in MapleStory.');
  if (payload.description.length < 5) throw new Error('Briefly describe what the GPS got wrong.');
  return payload;
}

// The report identity is separate from Chat and Market. Clients may insert, but never read the inbox.
export function createMapReportStore({ url = MARKET_URL, key = MARKET_KEY, fetchImpl = (...args) => fetch(...args), storage = browserStorage } = {}) {
  const base = url.replace(/\/+$/, '');
  async function session() {
    let saved = storage.get(SESSION_KEY);
    if (saved?.access_token && saved.expires_at * 1000 > Date.now() + 60_000) return saved;
    const refresh = saved?.refresh_token;
    const response = await fetchImpl(refresh ? `${base}/auth/v1/token?grant_type=refresh_token` : `${base}/auth/v1/signup`, {
      method: 'POST', headers: { apikey: key, 'Content-Type': 'application/json' }, body: JSON.stringify(refresh ? { refresh_token: refresh } : { data: {} })
    });
    if (!response.ok) {
      if (refresh) { storage.set(SESSION_KEY, null); return session(); }
      throw new Error('Map reporting is unavailable right now. Try again later.');
    }
    const body = await response.json();
    saved = { access_token: body.access_token, refresh_token: body.refresh_token,
      expires_at: body.expires_at ?? Math.floor(Date.now() / 1000) + (body.expires_in ?? 3600) };
    storage.set(SESSION_KEY, saved);
    return saved;
  }
  return {
    configured: Boolean(base && key),
    async submit(report) {
      const payload = mapReportPayload(report);
      const auth = await session();
      const response = await fetchImpl(`${base}/rest/v1/map_reports`, {
        method: 'POST', headers: { apikey: key, Authorization: `Bearer ${auth.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!response.ok) {
        if (response.status === 404) throw new Error('Map reports are not set up yet. Please try again later.');
        const detail = await response.json().catch(() => null);
        if (/slow down|too many|limit/i.test(detail?.message ?? '')) throw new Error('Please wait before sending another map report.');
        throw new Error('The map report could not be saved. Try again in a moment.');
      }
    }
  };
}
