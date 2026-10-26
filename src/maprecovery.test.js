import test from 'node:test';
import assert from 'node:assert/strict';
import { mapRecoveryChoices, advanceManualMapLock } from './maprecovery.js';

test('recovery offers the current map, pending read and connected maps only', () => {
  const maps = ['A', 'B', 'C', 'D'].map(id => ({ id, name: id, area: 'Road' }));
  const portals = [{ from: 'A', to: 'B' }, { from: 'C', to: 'A' }, { from: 'D', to: 'C' }];
  assert.deepEqual(mapRecoveryChoices({ maps, portals }, 'A', 'B').map(x => x.id), ['A', 'B', 'C']);
  assert.equal(mapRecoveryChoices({ maps, portals }, 'A')[0].label, 'A — Road');
  assert.deepEqual(mapRecoveryChoices({ maps, portals }, 'missing'), []);
  assert.deepEqual(mapRecoveryChoices({ maps, portals }, null, null, ['D']).map(x => x.id), ['D']);
});

test('manual correction holds through OCR noise and releases on the next title change', () => {
  const signature = new Uint8Array([1, 0, 1]);
  const lock = advanceManualMapLock({ mapId: 'B', signature: null }, signature);
  assert.equal(lock.signature, signature);
  assert.equal(advanceManualMapLock(lock, signature, false), lock);
  assert.equal(advanceManualMapLock(lock, new Uint8Array([0, 1, 0]), true), null);
});
