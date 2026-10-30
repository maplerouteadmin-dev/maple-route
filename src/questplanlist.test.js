import test from 'node:test';
import assert from 'node:assert/strict';
import { outstandingQuests, removePlannedQuest } from './questplanlist.js';

test('shows scanned and manually chosen outstanding quests once each', () => {
  assert.deepEqual(outstandingQuests({ activeQuests: ['Shumi', 'Luke'], planQuests: ['Luke', 'Nella'], questsAvailable: ['Nella', 'Sophia'], questsFinished: ['Shumi'], planSkip: ['Luke'] }), [
    { name: 'Luke', sources: ['In Progress', 'Added by hand'], status: 'left-out' },
    { name: 'Nella', sources: ['Added by hand', 'Available'], status: 'included' },
    { name: 'Sophia', sources: ['Available'], status: 'included' }
  ]);
});

test('available-only quests are visible even when the global available toggle is off', () => {
  assert.deepEqual(outstandingQuests({ questsAvailable: ['Sophia'], includeAvailable: false }), [
    { name: 'Sophia', sources: ['Available'], status: 'available-only' }
  ]);
});

test('Quest Helper quests share the plan list and exclusions used by GPS suggestions', () => {
  assert.deepEqual(outstandingQuests({ helperQuests: ['Luke'], planQuests: ['Nella'], planSkip: ['Luke'] }), [
    { name: 'Luke', sources: ['Quest Helper'], status: 'left-out' },
    { name: 'Nella', sources: ['Added by hand'], status: 'included' }
  ]);
});

test('removing a manual quest drops it; a scanned quest stays left out after another scan', () => {
  const original = { planQuests: ['Nella', 'Luke'], activeQuests: ['Luke'], planSkip: [] };
  const withoutNella = removePlannedQuest(original, 'Nella');
  assert.deepEqual(withoutNella, { planQuests: ['Luke'], planSkip: [] });
  assert.equal(outstandingQuests({ ...original, ...withoutNella }).some(entry => entry.name === 'Nella'), false);
  const withoutLuke = removePlannedQuest({ ...original, ...withoutNella }, 'Luke');
  assert.deepEqual(withoutLuke, { planQuests: [], planSkip: ['Luke'] });
  assert.deepEqual(outstandingQuests({ ...original, ...withoutLuke, activeQuests: ['Luke', 'Luke'] })[0].status, 'left-out');
});
