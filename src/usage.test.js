import test from 'node:test';
import assert from 'node:assert/strict';
import { countingEnabled } from './usage.js';

test('usage counting only runs on the public site, with a code set, for players who did not opt out', () => {
  assert.equal(countingEnabled({ code: '', local: false }), false);
  assert.equal(countingEnabled({ code: 'mapleroute', local: true }), false);
  assert.equal(countingEnabled({ code: 'mapleroute', local: false, optedOut: true }), false);
  assert.equal(countingEnabled({ code: 'mapleroute', local: false }), true);
});
