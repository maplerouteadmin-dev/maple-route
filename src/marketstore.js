// Where marketplace listings live. Shared: a Supabase project (Postgres behind its REST API), with
// anonymous sign-in so players need no account; the database rules (supabase/market.sql) let anyone
// read live listings and only the browser that posted a listing change or remove it. Practice: this
// browser only (localStorage), used until the project is set up, or for trying it out.
// Set MARKET_URL / MARKET_KEY (the project's URL and public "anon" key) to switch to shared.
export const MARKET_URL = '';
export const MARKET_KEY = '';
const SESSION_KEY = 'maple-route-market-session';
const PRACTICE_KEY = 'maple-route-market-practice';

const storage = {
  get(key) { try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; } },
  set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage blocked */ } }
};

export function createMarketStore({ url = MARKET_URL, key = MARKET_KEY, fetchImpl = (...args) => fetch(...args) } = {}) {
  return url && key ? sharedStore(url.replace(/\/+$/, ''), key, fetchImpl) : practiceStore();
}

function sharedStore(url, key, fetchImpl) {
  // Anonymous session: created once per browser, refreshed when it runs out. Its user id owns the
  // listings this browser posts.
  async function session() {
    let saved = storage.get(SESSION_KEY);
    if (saved?.access_token && saved.expires_at * 1000 > Date.now() + 60_000) return saved;
    const refresh = saved?.refresh_token;
    const response = await fetchImpl(refresh ? `${url}/auth/v1/token?grant_type=refresh_token` : `${url}/auth/v1/signup`, {
      method: 'POST', headers: { apikey: key, 'Content-Type': 'application/json' }, body: JSON.stringify(refresh ? { refresh_token: refresh } : { data: {} })
    });
    if (!response.ok) { if (refresh) { storage.set(SESSION_KEY, null); return session(); } throw new Error('The marketplace is unavailable right now.'); }
    const body = await response.json();
    saved = { access_token: body.access_token, refresh_token: body.refresh_token, expires_at: body.expires_at ?? Math.floor(Date.now() / 1000) + (body.expires_in ?? 3600), user: body.user?.id };
    storage.set(SESSION_KEY, saved);
    return saved;
  }
  async function call(path, { method = 'GET', body = null, prefer = null } = {}) {
    const s = await session();
    const response = await fetchImpl(`${url}/rest/v1/${path}`, { method, headers: { apikey: key, Authorization: `Bearer ${s.access_token}`, 'Content-Type': 'application/json', ...(prefer ? { Prefer: prefer } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    if (!response.ok) {
      const detail = await response.json().catch(() => null);
      throw new Error(/too many|limit/i.test(detail?.message ?? '') ? 'You have the most listings allowed at once; remove one first.' : 'The marketplace could not save that right now.');
    }
    return response.status === 204 ? null : response.json();
  }
  return {
    shared: true,
    async me() { return (await session()).user; },
    // Live listings, newest first (the database hides expired ones too).
    list({ itemId = null, limit = 300 } = {}) {
      const params = new URLSearchParams({ select: '*', order: 'created_at.desc', limit: String(limit), expires_at: `gt.${new Date().toISOString()}` });
      if (itemId) params.set('item_id', `eq.${itemId}`);
      return call(`listings?${params}`);
    },
    async add(listing) { const [row] = await call('listings', { method: 'POST', body: listing, prefer: 'return=representation' }); return row; },
    remove(id) { return call(`listings?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE' }); }
  };
}

function practiceStore() {
  const all = () => storage.get(PRACTICE_KEY) ?? [];
  return {
    shared: false,
    async me() { return 'practice'; },
    async list({ itemId = null } = {}) { const now = Date.now(); return all().filter(l => Date.parse(l.expires_at) > now && (!itemId || l.item_id === itemId)).sort((a, b) => b.created_at.localeCompare(a.created_at)); },
    async add(listing) { const row = { ...listing, id: `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, owner: 'practice', created_at: new Date().toISOString() }; storage.set(PRACTICE_KEY, [row, ...all()].slice(0, 200)); return row; },
    async remove(id) { storage.set(PRACTICE_KEY, all().filter(l => l.id !== id)); return null; }
  };
}
