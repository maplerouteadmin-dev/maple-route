import test from 'node:test';
import assert from 'node:assert/strict';
import { firstGuideStop } from './guidepriority.js';

test('combined quest plan selects its first hunt instead of an unrelated NPC', () => {
  const plan = { trip: { order: [{ type: 'hunt', mapId: 'forest-south', quests: ['Snail Hunt', 'The Old Snail'], goals: ['Snail Shell'] }] }, ends: new Map() };
  assert.deepEqual(firstGuideStop(plan), { stop: plan.trip.order[0], mapId: 'forest-south', npc: null });
});

test('a genuine start or hand-in stop keeps its named NPC', () => {
  const start = { trip: { order: [{ type: 'start', mapId: 'ellinia', npc: 'Wing the Fairy' }] } };
  const handin = { trip: { order: [{ type: 'handin', mapId: 'henesys' }] }, ends: new Map([['henesys', ['Jay']]]) };
  assert.equal(firstGuideStop(start).npc, 'Wing the Fairy');
  assert.equal(firstGuideStop(handin).npc, 'Jay');
});

test('an empty plan cannot invent a destination', () => {
  assert.equal(firstGuideStop({ trip: { order: [] } }), null);
});
