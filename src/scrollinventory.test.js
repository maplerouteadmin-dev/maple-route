import test from 'node:test';
import assert from 'node:assert/strict';
import { ownedTownScrolls } from './scrollinventory.js';

test('town-scroll inventory keeps only confirmed destinations', () => {
  assert.deepEqual(ownedTownScrolls(['Perion', 'Perion', 'Unknown']), ['Perion']);
  assert.deepEqual(ownedTownScrolls(null), []);
});
