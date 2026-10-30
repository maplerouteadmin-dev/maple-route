import test from 'node:test';
import assert from 'node:assert/strict';
import { questMobReminder } from './questreminders.js';

const spawns = [{ name: 'Dark Stump', count: 8 }, { name: 'Boar', count: 15 }];
const goal = { name: 'Dark Stump', kind: 'kill', monsters: ['Dark Stump'], quests: ['Hunt'], need: 25 };

test('reminds only about an active quest mob spawning on the entered map', () => {
  assert.equal(questMobReminder([goal], spawns, [], ['Hunt']), 'Quest opportunity on this map: Dark Stump: quest target.');
  assert.equal(questMobReminder([goal], spawns, [], []), '');
  assert.equal(questMobReminder([goal], [{ name: 'Boar' }], [], ['Hunt']), '');
});

test('never speaks remaining or total counts from Quest Helper', () => {
  const helper = [{ name: 'Hunt', progress: [{ name: 'Dark Stump', have: 9, need: 25 }] }];
  assert.equal(questMobReminder([goal], spawns, helper, ['Hunt']), 'Quest opportunity on this map: Dark Stump: quest target.');
  helper[0].progress[0].have = 25;
  assert.equal(questMobReminder([goal], spawns, helper, ['Hunt']), 'Quest opportunity on this map: Dark Stump: quest target.');
});

test('does not turn dubious OCR or guessed item sources into exact claims', () => {
  const helper = [{ name: 'Hunt', progress: [{ name: 'Dark Stump', have: 93, need: 25 }] }];
  assert.equal(questMobReminder([goal], spawns, helper, ['Hunt']), 'Quest opportunity on this map: Dark Stump: quest target.');
  assert.equal(questMobReminder([{ ...goal, guess: true }], spawns, [], ['Hunt']), '');
  assert.equal(questMobReminder([{ ...goal, done: true }], spawns, [], ['Hunt']), '');
});

test('distinguishes item farming from kill counts and limits spoken entries', () => {
  const goals = [goal, { name: 'Tree Branch', kind: 'collect', monsters: ['Dark Stump'], quests: ['Hunt'] }, { name: 'Boar', kind: 'kill', monsters: ['Boar'], quests: ['Hunt'] }];
  const said = questMobReminder(goals, spawns, [{ name: 'Hunt', progress: [{ name: 'Tree Branch', have: 2, need: 10 }] }], ['Hunt'], { limit: 2 });
  assert.match(said, /Boar: quest target/);
  assert.match(said, /Dark Stump: quest target; hunt for Tree Branch/);
  assert.doesNotMatch(said, /\d/);
});

test('shared kill objective makes one qualitative reminder', () => {
  const both = { ...goal, quests: ['Hunt', 'Second hunt'] };
  const helpers = [{ name: 'Hunt', progress: [{ name: 'Dark Stump', have: 9, need: 25 }] }, { name: 'Second hunt', progress: [{ name: 'Dark Stump', have: 4, need: 10 }] }];
  assert.equal(questMobReminder([both], spawns, helpers, ['Hunt', 'Second hunt']), 'Quest opportunity on this map: Dark Stump: quest target.');
});

test('arrival opportunity omits the mob already announced by the guided hunt', () => {
  const other = { name: 'Boar', kind: 'kill', monsters: ['Boar'], quests: ['Second hunt'] };
  assert.equal(questMobReminder([goal], spawns, [], ['Hunt'], { excludeMonsters: ['dark stump'] }), '');
  assert.equal(questMobReminder([goal, other], spawns, [], ['Hunt', 'Second hunt'], { excludeMonsters: ['Dark Stump'] }), 'Quest opportunity on this map: Boar: quest target.');
});

test('a guided item hunt also suppresses the same mob but leaves other mobs', () => {
  const items = { name: 'Leaf', kind: 'collect', monsters: ['Dark Stump', 'Boar'], quests: ['Hunt'] };
  assert.equal(questMobReminder([items], spawns, [], ['Hunt'], { excludeMonsters: ['Dark Stump'] }), 'Quest opportunity on this map: Boar: hunt for Leaf.');
});
