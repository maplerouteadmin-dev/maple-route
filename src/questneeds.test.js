import test from 'node:test';
import assert from 'node:assert/strict';
import { completeQuestNeeds } from './questneeds.js';

test('a required Salad missing from game objectives is still part of Luke\'s route', () => {
  const needs = completeQuestNeeds({ needs: [{ name: 'Jr. Necki Skin', count: 10, type: 'item' }] },
    [{ name: 'Jr. Necki Skin', quantity: 10 }, { name: 'Salad', quantity: 1 }]);
  assert.deepEqual(needs.map(need => [need.name, need.count]), [['Jr. Necki Skin', 10], ['Salad', 1]]);
});

test('wiki quest-item suffixes and possessive spelling do not duplicate an objective', () => {
  const needs = completeQuestNeeds({ needs: [{ name: "Hero's Gladius", count: 1, type: 'item' }, { name: "Lucas's Letter", count: 1, type: 'item' }] },
    [{ name: "Hero's Gladius (quest item)", quantity: 1 }, { name: "Lucas' Letter", quantity: 1 }]);
  assert.equal(needs.length, 2);
});
