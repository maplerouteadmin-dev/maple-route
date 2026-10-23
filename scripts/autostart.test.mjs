import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('the open-with-MapleStory switch turns off and on, and only the app may change it', async () => {
  process.env.LOCALAPPDATA = mkdtempSync(join(tmpdir(), 'mr-'));
  const { autostartEnabled, setAutostart, sameOrigin } = await import('./autostart.mjs');
  assert.equal(autostartEnabled(), true);
  assert.equal(setAutostart(false), false); assert.equal(autostartEnabled(), false);
  assert.equal(setAutostart(true), true);
  assert.equal(sameOrigin({ headers: { origin: 'http://localhost:5174' } }, 5174), true);
  assert.equal(sameOrigin({ headers: { origin: 'https://evil.example' } }, 5174), false);
});
