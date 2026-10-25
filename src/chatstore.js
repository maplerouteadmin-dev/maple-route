import { MARKET_URL, MARKET_KEY } from './marketstore.js';

const SESSION_KEY = 'maple-route-chat-session';
const browserStorage = {
  get(key) { try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; } },
  set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* chat still works until the tab closes */ } }
};

// Chat has its own anonymous account, separate from Market. A public Market listing
// can include a character name, so sharing that account ID would link it to chat.
export function createChatStore({ url = MARKET_URL, key = MARKET_KEY, fetchImpl = (...args) => fetch(...args), storage = browserStorage } = {}) {
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
      throw new Error('Community chat sign-in is unavailable. Try again later.');
    }
    const body = await response.json();
    saved = { access_token: body.access_token, refresh_token: body.refresh_token,
      expires_at: body.expires_at ?? Math.floor(Date.now() / 1000) + (body.expires_in ?? 3600), user: body.user?.id };
    storage.set(SESSION_KEY, saved);
    return saved;
  }
  async function call(path, { method = 'GET', body = null } = {}) {
    const auth = await session();
    const response = await fetchImpl(`${base}/rest/v1/${path}`, {
      method,
      headers: { apikey: key, Authorization: `Bearer ${auth.access_token}`, 'Content-Type': 'application/json' },
      ...(body === null ? {} : { body: JSON.stringify(body) })
    });
    if (!response.ok) {
      if (response.status === 404) throw new Error('Community chat is not set up on the server yet.');
      if (response.status === 429) throw new Error('Slow down a little before posting again.');
      const detail = await response.json().catch(() => null);
      if (/too many|slow down|wait/i.test(detail?.message ?? '')) throw new Error('Slow down a little before posting again.');
      throw new Error('Chat could not connect or save. Try again in a moment.');
    }
    return method === 'POST' || response.status === 204 ? null : response.json();
  }
  return {
    configured: Boolean(base && key),
    async me() { return (await session()).user; },
    async list(room) {
      const params = new URLSearchParams({ select: 'id,owner,body,created_at', kind: `eq.${room.kind}`, world: `eq.${room.world}`, order: 'created_at.desc', limit: '50' });
      params.set('channel', room.channel == null ? 'is.null' : `eq.${room.channel}`);
      params.set('map_id', room.mapId == null ? 'is.null' : `eq.${room.mapId}`);
      return call(`chat_messages?${params}`);
    },
    send(room, body) { return call('chat_messages', { method: 'POST', body: { kind: room.kind, world: room.world, channel: room.channel, map_id: room.mapId, body } }); },
    report(messageId, reason) { return call('chat_reports', { method: 'POST', body: { message_id: messageId, reason } }); }
  };
}
