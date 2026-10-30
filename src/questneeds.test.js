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

test('a job tag on the wiki item is the same item, not a second need', async () => {
  const { completeQuestNeeds } = await import('./questneeds.js');
  const needs = completeQuestNeeds({ needs: [{ type: 'item', name: 'Dark Marble', count: 30 }] }, [{ name: 'Dark Marble (Warrior)', quantity: 30 }]);
  assert.deepEqual(needs.map(n => [n.name, n.count]), [['Dark Marble', 30]]);
});

test('wiki rows cannot re-add an item the game gives on accepting the quest', () => {
  const quest = { startItems: [{ name: "Arcon's Blood", count: 1 }], needs: [
    { type: 'item', name: "Arcon's Blood", count: 1 }, { type: 'item', name: 'Leaf', count: 30 }
  ] };
  const needs = completeQuestNeeds(quest, [{ name: "Arcon's Blood (quest item)", quantity: 1 }, { name: 'Leaf', quantity: 30 }]);
  assert.deepEqual(needs.map(item => item.name), ['Leaf']);
});

