import test from 'node:test';
import assert from 'node:assert/strict';
import { plausibleNeighborTitle, uniqueNeighborPrefix } from './mapconfidence.js';

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

test('a cut-off West Street title is accepted only as a unique neighbor candidate', () => {
  const maps = [
    { id: 'perion', name: 'Perion' },
    { id: 'west', name: 'West Street Corner of Perion' },
    { id: 'other', name: 'Perion Street Corner' }
  ];
  assert.equal(uniqueNeighborPrefix('Victoria Road\nWest Street Corner of', maps, 'perion', ['west', 'other'])?.id, 'west');
  assert.equal(uniqueNeighborPrefix('Victoria Road\nWest Street Corner of', maps, 'other', [])?.id, undefined);
  assert.equal(uniqueNeighborPrefix('Victoria Road\nPerion', maps, 'perion', ['west', 'other']), null);
  assert.equal(uniqueNeighborPrefix('Victoria Road\nWest Street', [...maps, { id: 'west2', name: 'West Street Market' }], 'perion', ['west', 'west2']), null);
});
