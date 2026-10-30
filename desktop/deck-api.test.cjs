const test = require('node:test');
const assert = require('node:assert/strict');
const { startDeckApi } = require('./deck-api.cjs');

test('local API requires Decky header for capture commands', async () => {
  let started = 0, pairing = null;
  const server = await startDeckApi({ port: 0, status: () => ({ state: 'off' }), start: () => started++, stop() {}, overlay() {}, pairing: visible => { pairing = visible; } });
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    assert.deepEqual(await (await fetch(base + '/status')).json(), { state: 'off' });
    assert.equal((await fetch(base + '/start', { method: 'POST' })).status, 403);
    assert.equal(started, 0);
    assert.equal((await fetch(base + '/start', { method: 'POST', headers: { 'x-maple-decky': '1' } })).status, 200);
    assert.equal(started, 1);
    assert.equal((await fetch(base + '/pairing', { method: 'POST', body: JSON.stringify({ visible: false }) })).status, 403);
    assert.equal((await fetch(base + '/pairing', { method: 'POST', headers: { 'x-maple-decky': '1' }, body: JSON.stringify({ visible: false }) })).status, 200);
    assert.equal(pairing, false);
    assert.equal((await fetch(base + '/pairing', { method: 'POST', headers: { 'x-maple-decky': '1' }, body: '{}' })).status, 400);
  } finally { await new Promise(resolve => server.close(resolve)); }
});

test('map recovery requires the Decky header and a permitted map id', async () => {
  let selected = null;
  const server = await startDeckApi({ port: 0, status: () => ({ mapId: '1' }), start() {}, stop() {}, overlay() {},
    recoverMap: id => { if (id !== '2') return false; selected = id; return true; } });
  const base = `http://127.0.0.1:${server.address().port}/map-recover`;
  const post = (mapId, header = true) => fetch(base, { method: 'POST', headers: header ? { 'x-maple-decky': '1' } : {}, body: JSON.stringify({ mapId }) });
  try {
    assert.equal((await post('2', false)).status, 403);
    assert.equal((await post('99')).status, 400);
    assert.equal((await post('2')).status, 200);
    assert.equal(selected, '2');
  } finally { await new Promise(resolve => server.close(resolve)); }
});
