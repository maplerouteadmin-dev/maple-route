import test from 'node:test';
import assert from 'node:assert/strict';
import { createMarketStore } from './marketstore.js';

// localStorage for node
const memory = new Map();
globalThis.localStorage = { getItem: k => memory.get(k) ?? null, setItem: (k, v) => memory.set(k, String(v)), removeItem: k => memory.delete(k) };

test('shared store: anonymous session once, then listings through the REST API', async () => {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url, method: options.method ?? 'GET', auth: options.headers?.Authorization, body: options.body });
    if (url.endsWith('/auth/v1/signup')) return new Response(JSON.stringify({ access_token: 'tok', refresh_token: 'ref', expires_in: 3600, user: { id: 'user-1' } }));
    if (url.includes('/rest/v1/listings?select')) return new Response(JSON.stringify([{ id: 'a', owner: 'user-1' }]));
    if (url.endsWith('/rest/v1/listings')) return new Response(JSON.stringify([{ id: 'b', ...JSON.parse(options.body) }]), { status: 201 });
    return new Response(null, { status: 204 });
  };
  const store = createMarketStore({ url: 'https://x.supabase.co/', key: 'anon', fetchImpl });
  assert.equal(store.shared, true);
  assert.equal(await store.me(), 'user-1');
  assert.deepEqual(await store.list(), [{ id: 'a', owner: 'user-1' }]);
  assert.equal((await store.add({ item_name: 'Work Gloves' })).id, 'b');
  await store.remove('b');
  assert.equal(calls.filter(c => c.url.includes('/auth/')).length, 1); // the session is reused
  assert.ok(calls.filter(c => c.url.includes('/rest/')).every(c => c.auth === 'Bearer tok'));
  assert.match(calls.find(c => c.url.includes('select')).url, /expires_at=gt\./);
  assert.equal(calls.at(-1).method, 'DELETE');
});

test('without a project the market runs in practice mode on this PC', async () => {
  const store = createMarketStore({ url: '', key: '' });
  assert.equal(store.shared, false);
  const row = await store.add({ item_id: '1', item_name: 'Work Gloves', expires_at: new Date(Date.now() + 86_400_000).toISOString() });
  assert.deepEqual((await store.list()).map(l => l.id), [row.id]);
  await store.remove(row.id);
  assert.deepEqual(await store.list(), []);
});
