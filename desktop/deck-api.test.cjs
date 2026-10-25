const test = require('node:test');
const assert = require('node:assert/strict');
const { startDeckApi } = require('./deck-api.cjs');

test('local API requires Decky header for capture commands', async () => {
  let started = 0;
  const server = await startDeckApi({ port: 0, status: () => ({ state: 'off' }), start: () => started++, stop() {}, overlay() {} });
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    assert.deepEqual(await (await fetch(base + '/status')).json(), { state: 'off' });
    assert.equal((await fetch(base + '/start', { method: 'POST' })).status, 403);
    assert.equal(started, 0);
    assert.equal((await fetch(base + '/start', { method: 'POST', headers: { 'x-maple-decky': '1' } })).status, 200);
    assert.equal(started, 1);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
