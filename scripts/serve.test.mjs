import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { relayTarget, startServer, staticPath } from './serve.mjs';

test('relays the same OSMS paths as the dev server', () => {
  assert.equal(relayTarget('/osms-img/images/maps/010001050.png'), 'https://osmsdataexplorer.com/data/current/images/maps/010001050.png');
  assert.equal(relayTarget('/osms-data/maps/abc.webp'), 'https://osmsdataexplorer.com/data/maps/abc.webp');
  assert.equal(relayTarget('/src/app.js'), null);
});

test('never serves files outside dist', () => {
  const base = join('C:', 'app', 'dist');
  assert.equal(staticPath(base, '/'), join(base, 'index.html'));
  assert.equal(staticPath(base, '/assets/a.js'), join(base, 'assets', 'a.js'));
  for (const sneaky of ['/../secret.txt', '/%2e%2e/secret.txt', '/..%5c..%5csecret.txt']) {
    const file = staticPath(base, sneaky);
    assert.ok(file === null || file.startsWith(base), `${sneaky} -> ${file}`);
  }
});

test('Electron server binds only loopback and does not expose Windows autostart', async () => {
  const { server, url } = await startServer({ port: 0, enableAutostart: false });
  try {
    assert.match(url, /^http:\/\/127\.0\.0\.1:\d+$/);
    const response = await fetch(url + '/__autostart');
    assert.equal(response.status, 404);
    assert.equal((await fetch(url + '/__couch/status')).status, 403);
    const status = await fetch(url + '/__couch/status', { headers: { 'x-maple-couch': '1' } });
    assert.deepEqual(await status.json(), { enabled: false, connectedPhones: 0 });
    const forged = await fetch(url + '/__couch/enable', { method: 'POST', headers: { 'x-maple-couch': '1', origin: 'https://other.example' } });
    assert.equal(forged.status, 403);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
