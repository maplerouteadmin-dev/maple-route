import test from 'node:test';
import assert from 'node:assert/strict';
import { createChatStore } from './chatstore.js';

test('opt-in chat creates its own anonymous account and scopes the room query', async () => {
  const requests = [];
  const saved = new Map();
  const store = createChatStore({ url: 'https://example.supabase.co', key: 'public-key', storage: { get: key => saved.get(key), set: (key, value) => saved.set(key, value) }, fetchImpl: async (url, options) => {
    requests.push({ url, options });
    return { ok: true, status: 200, json: async () => url.includes('/signup') ? { access_token: 'chat-session', refresh_token: 'chat-refresh', expires_in: 3600, user: { id: 'chat-user' } } : [] };
  } });
  assert.equal(await store.me(), 'chat-user');
  await store.list({ kind: 'here', world: 'scania', channel: 3, mapId: '100000000' });
  assert.match(requests[0].url, /\/auth\/v1\/signup$/);
  assert.match(requests[1].url, /kind=eq.here/);
  assert.match(requests[1].url, /channel=eq.3/);
  assert.match(requests[1].url, /map_id=eq.100000000/);
  assert.equal(requests[1].options.headers.Authorization, 'Bearer chat-session');
});
