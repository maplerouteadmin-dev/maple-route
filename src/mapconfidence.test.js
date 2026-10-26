import test from 'node:test';
import assert from 'node:assert/strict';
import { plausibleNeighborTitle } from './mapconfidence.js';

const match = (id, name, score) => ({ map: { id, name }, score });

test('one imperfect but clear neighboring title may be confirmed on a second read', () => {
  assert.equal(plausibleNeighborTitle([match('forest', 'Swampy Land in a Deep Forest', .84)], 'sleepywood', ['forest']), true);
});

test('does not trust an ambiguous, weak, distant or unchanged title', () => {
  assert.equal(plausibleNeighborTitle([match('forest', 'Forest', .83), match('other', 'Other Forest', .76)], 'old', ['forest']), false);
  assert.equal(plausibleNeighborTitle([match('forest', 'Forest', .77)], 'old', ['forest']), false);
  assert.equal(plausibleNeighborTitle([match('forest', 'Forest', .85)], 'old', ['elsewhere']), false);
  assert.equal(plausibleNeighborTitle([match('old', 'Old', .85)], 'old', ['forest']), false);
});
