import test from 'node:test';
import assert from 'node:assert/strict';
import { newSyncCode, normalizeSyncCode, syncPayload, readSyncPayload, syncFingerprint, createSyncStore } from './progresssync.js';

test('sync codes are long, easy to type and read back however they are typed', () => {
  const code = newSyncCode(n => Uint8Array.from({ length: n }, (_, i) => i * 7));
  assert.match(code, /^MR-[A-Z2-9]{4}(-[A-Z2-9]{4}){4}$/);
  assert.equal(normalizeSyncCode(code.toLowerCase().replaceAll('-', ' ')), code);
  assert.equal(normalizeSyncCode(code.slice(3)), code);
  assert.equal(normalizeSyncCode('MR-ABCD'), null);
  assert.equal(normalizeSyncCode('MR-0000-0000-0000-0000-0000'), null); // 0 is never used
});

test('the quest plan travels between devices; the map you are on does not', () => {
  const state = { current: 'map1', destination: 'map2', level: 27, planQuests: ['[Event] The First Mark'], questDone: { A: [1, 'need:Leaf'] },
    activeQuests: ['A'], guide: { quest: 'A' }, tripAll: true, goals: [], sessions: [] };
  const payload = syncPayload(state, { character: 'Hero' });
  assert.equal(payload.profile.current, undefined);
  assert.deepEqual(payload.live, { guideQuest: 'A', tripAll: true, tripAvailable: true, startingQuest: null, goalNpc: null });
  const read = readSyncPayload(JSON.parse(JSON.stringify(payload)), { character: 'Hero' });
  assert.deepEqual(read.profile.planQuests, ['[Event] The First Mark']);
  assert.equal(read.profile.level, 27);
  assert.equal(read.live.guideQuest, 'A');
  assert.deepEqual(readSyncPayload(payload, { character: 'Alt' }), { otherCharacter: 'Hero' });
  assert.equal(readSyncPayload({ format: 'x' }), null);
  assert.equal(syncFingerprint(payload), syncFingerprint(syncPayload({ ...state, current: 'elsewhere' }, { character: 'Hero' })));
});

test('bad values from the server are dropped, not applied', () => {
  const read = readSyncPayload({ format: 'maple-route-sync', version: 1, character: '', profile: { level: 999, planQuests: 'oops', questsFinished: ['B'] }, live: {} });
  assert.equal(read.profile.level, undefined);
  assert.equal(read.profile.planQuests, undefined);
  assert.deepEqual(read.profile.questsFinished, ['B']);
});

test('the store calls the two sync functions with the code', async () => {
  const calls = [];
  const store = createSyncStore({ url: 'https://x.supabase.co/', key: 'k', fetchImpl: async (url, init) => {
    calls.push([url, JSON.parse(init.body)]);
    return { ok: true, status: 200, json: async () => [{ data: { a: 1 }, updated_at: '2026-11-01T00:00:00Z', saved: true }] };
  } });
  assert.deepEqual(await store.get('MR-AAAA-AAAA-AAAA-AAAA-AAAA'), { data: { a: 1 }, updated_at: '2026-11-01T00:00:00Z', saved: true });
  await store.put('MR-AAAA-AAAA-AAAA-AAAA-AAAA', { a: 2 }, '2026-10-31T00:00:00Z');
  assert.deepEqual(calls.map(([url]) => url), ['https://x.supabase.co/rest/v1/rpc/sync_get', 'https://x.supabase.co/rest/v1/rpc/sync_put']);
  assert.deepEqual(calls[1][1], { code: 'MR-AAAA-AAAA-AAAA-AAAA-AAAA', payload: { a: 2 }, base: '2026-10-31T00:00:00Z' });
  const missing = createSyncStore({ url: 'https://x', key: 'k', fetchImpl: async () => ({ ok: false, status: 404 }) });
  await assert.rejects(missing.get('MR-AAAA-AAAA-AAAA-AAAA-AAAA'), /not set up/);
});
