import test from 'node:test';
import assert from 'node:assert/strict';
import { verifiedQuestDrop } from './items.js';

test('the Rainbow-colored Snail Shell has a verified Mano source', () => {
  assert.deepEqual(verifiedQuestDrop('Rainbow-colored Snail Shell'), ['Mano']);
  assert.deepEqual(verifiedQuestDrop('Rainbow colored snail shell'), ['Mano']);
  assert.deepEqual(verifiedQuestDrop('Snail Shell'), []);
});
