import test from 'node:test';
import assert from 'node:assert/strict';
import { characterJourney, level20Journey } from './characterjourney.js';

const quests = [
  { id: '1', name: 'First', level: 5, prerequisites: [] },
  { id: '2', name: 'Second', level: 10, prerequisites: ['First'] },
  { id: '3', name: 'Warrior Test', level: 10, job: 'Warrior', prerequisites: [] },
  { id: '4', name: 'Unverified', prerequisites: ['Missing quest'] },
  { id: '5', name: 'Daily', repeatable: true }
];

test('confirmed completion unlocks a sequel, but missing screen text never does', () => {
  const before = characterJourney(quests, { level: 12, job: 'Warrior' });
  assert.equal(before.find(e => e.quest.id === '2').status, 'prerequisite');
  const after = characterJourney(quests, { level: 12, job: 'Warrior', finished: ['First'] });
  assert.equal(after.find(e => e.quest.id === '2').status, 'eligible');
});

test('level and planned job are respected', () => {
  const low = characterJourney(quests, { level: 5, job: 'Any' });
  assert.equal(low.find(e => e.quest.id === '2').status, 'level');
  assert.equal(low.find(e => e.quest.id === '3').status, 'choose-job');
  const thief = characterJourney(quests, { level: 12, job: 'Thief' });
  assert.equal(thief.find(e => e.quest.id === '3').status, 'other-job');
});

test('active quests take precedence; unknown prerequisites are disclosed', () => {
  const entries = characterJourney(quests, { level: 12, job: 'Warrior', active: ['Second'] });
  assert.equal(entries[0].quest.name, 'Second');
  assert.equal(entries[0].status, 'in-progress');
  assert.equal(entries.find(e => e.quest.id === '4').status, 'unknown-prerequisite');
  assert.ok(!entries.some(e => e.quest.id === '5'));
});

test('the in-game Available tab can confirm an otherwise missing prerequisite', () => {
  const entries = characterJourney(quests, { level: 12, job: 'Warrior', available: ['Second'] });
  assert.equal(entries.find(e => e.quest.id === '2').status, 'eligible');
});

test('unconfirmed level locks catalog candidates but not quests seen in game', () => {
  const unconfirmed = characterJourney(quests, { job: 'Warrior' });
  assert.equal(unconfirmed.find(e => e.quest.id === '2').status, 'confirm-level');
  const offered = characterJourney(quests, { job: 'Warrior', available: ['Second'] });
  assert.equal(offered.find(e => e.quest.id === '2').status, 'eligible');
  const tooLow = characterJourney(quests, { level: 9, job: 'Warrior', available: ['Second'] });
  assert.equal(tooLow.find(e => e.quest.id === '2').status, 'eligible');
});

test('the level-20 view groups live catalog entries without including high-level or repeatable quests', () => {
  const catalog = [...quests, { id: '6', name: 'Level 15', level: 15 }, { id: '7', name: 'Level 20', level: 20 }, { id: '8', name: 'Level 21', level: 21 }];
  const bands = level20Journey(characterJourney(catalog, { level: 20, job: 'Warrior', finished: ['First'] }));
  assert.deepEqual(bands.map(band => [band.min, band.max]), [[1, 9], [10, 14], [15, 19], [20, 20]]);
  assert.ok(!bands.some(band => band.entries.some(entry => ['First', 'Daily', 'Level 21'].includes(entry.quest.name))));
  assert.deepEqual(bands[3].entries.map(entry => entry.quest.name), ['Level 20']);
});
