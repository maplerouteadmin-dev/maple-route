import test from 'node:test';
import assert from 'node:assert/strict';
import { createCouchHost } from './couch.mjs';

test('couch sharing is opt-in, routes phone actions, and stops cleanly', async () => {
  let options, sent, ended = false, closed = false;
  const client = { end() { ended = true; } };
  const clients = new Set([client]);
  const host = createCouchHost({ localOrigin: 'http://127.0.0.1:5174', startPhoneServer: async value => {
    options = value;
    return { url: 'http://192.168.1.2:5178/phone?t=abc', qr: '<svg/>', clients, server: { close(done) { closed = true; done(); } }, publish(value) { sent = value; } };
  } });
  assert.deepEqual(host.status(), { enabled: false, connectedPhones: 0 });
  assert.equal(host.publish({ html: 'x', bodyClass: '' }), false);
  assert.equal((await host.enable()).enabled, true);
  assert.equal(host.status().connectedPhones, 1);
  host.status().connectedPhones = 99;
  assert.equal(host.status().connectedPhones, 1);
  clients.delete(client);
  assert.equal(host.status().connectedPhones, 0);
  clients.add(client);
  assert.equal(options.mode, 'couch');
  options.onAction({ kind: 'click', path: [1] });
  options.onStop();
  options.onStart();
  assert.deepEqual(host.drain(), [{ kind: 'click', path: [1] }, { kind: 'command', command: 'stop' }]);
  assert.equal(host.publish({ html: '<p>route</p>', bodyClass: 'gps-page', status: { state: 'reading' } }), true);
  assert.equal(sent.status.state, 'reading');
  await host.disable();
  assert.equal(ended, true);
  assert.equal(closed, true);
  assert.deepEqual(host.status(), { enabled: false, connectedPhones: 0 });
});
