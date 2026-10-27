import test from 'node:test';
import assert from 'node:assert/strict';
import { createMapReportStore, mapReportPayload } from './mapreports.js';

test('map reports require the actual map and a description, and contain no screen data', () => {
  assert.throws(() => mapReportPayload({ mapName: '', description: 'GPS stuck' }), /map name/i);
  assert.throws(() => mapReportPayload({ mapName: 'Perion', description: '' }), /describe/i);
  assert.deepEqual(mapReportPayload({ mapName: 'West Street Corner of Perion', observedMap: 'Perion', description: 'GPS stayed on the old map', version: '1.1.0', platform: 'deck', screenshot: 'private', chat: 'private' }), {
    map_name: 'West Street Corner of Perion', observed_map: 'Perion', description: 'GPS stayed on the old map', version: '1.1.0', platform: 'deck'
  });
});

test('reports use a separate anonymous account and submit to the write-only inbox', async () => {
  const requests = [];
  const storage = { get: () => null, set: () => {} };
  const store = createMapReportStore({ url: 'https://example.supabase.co/', key: 'public', storage, fetchImpl: async (url, options) => {
    requests.push({ url, ...options });
    return url.endsWith('/signup') ? { ok: true, json: async () => ({ access_token: 'token', refresh_token: 'refresh', expires_in: 3600 }) } : { ok: true };
  } });
  await store.submit({ mapName: 'West Street Corner of Perion', description: 'Wrong map', observedMap: 'Perion' });
  assert.match(requests[0].url, /auth\/v1\/signup$/);
  assert.equal(requests[1].url, 'https://example.supabase.co/rest/v1/map_reports');
  assert.equal(requests[1].headers.Authorization, 'Bearer token');
  assert.equal(JSON.parse(requests[1].body).map_name, 'West Street Corner of Perion');
});

test('an absent live inbox produces an actionable message instead of a silent failure', async () => {
  const store = createMapReportStore({ url: 'https://example.supabase.co', key: 'public', storage: { get: () => null, set: () => {} }, fetchImpl: async url =>
    url.endsWith('/signup') ? { ok: true, json: async () => ({ access_token: 'token', expires_in: 3600 }) } : { ok: false, status: 404 }
  });
  await assert.rejects(store.submit({ mapName: 'Perion', description: 'GPS shows another map' }), /not set up yet/i);
});
