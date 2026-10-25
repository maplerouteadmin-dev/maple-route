import test from 'node:test';
import assert from 'node:assert/strict';
import { checkNote, mergeNotes, weekVersion, applyNotes, notedSources, weekKey, variantItems } from './questnotes.js';
import { collapseRotations } from './quests.js';

const donating = collapseRotations([
  { id: '506119', name: 'Donating to Kerning City', rotation: 'Citizenship Kerning City Weekly', level: 12, grade: 1, needs: [{ type: 'item', name: 'Red Snail Shell', count: 30 }] },
  { id: '506125', name: 'Donating to Kerning City', rotation: 'Citizenship Kerning City Weekly', level: 12, grade: 2, needs: [{ type: 'item', name: 'Firewood', count: 30 }] },
  { id: '1', name: 'Mystery Errand', needs: [] }
]);
const game = { quests: donating, mobs: ['Stump', 'Octopus'], npcs: ['Shumi', 'Mr. Pickall'] };
const now = new Date('2026-10-24T12:00:00Z');

test('weekly rotations become one quest with its versions', () => {
  assert.equal(donating.length, 2);
  assert.deepEqual(donating[0].needs, []);
  assert.deepEqual(variantItems(donating[0]), ['Red Snail Shell', 'Firewood']);
});

test('notes are checked against the game data', () => {
  assert.equal(checkNote({ kind: 'week', quest: 'donating to kerning city', item: 'firewood' }, game, now).note.item, 'Firewood');
  assert.match(checkNote({ kind: 'week', quest: 'Donating to Kerning City', item: 'Gold' }, game, now).error, /one of/);
  assert.equal(checkNote({ kind: 'need', quest: 'Mystery Errand', item: 'Old Key', count: '3' }, game).note.count, 3);
  assert.match(checkNote({ kind: 'need', quest: 'Mystery Errand', item: 'Old Key', count: 0 }, game).error, /How many/);
  assert.match(checkNote({ kind: 'need', quest: 'Mystery Errand', item: 'see www.x.com', count: 1 }, game).error, /name/);
  assert.match(checkNote({ kind: 'drop', item: 'Old Key', value: 'Dragon' }, game).error, /monster/);
  assert.equal(checkNote({ kind: 'given', item: 'Old Key', value: 'shumi' }, game).note.value, 'Shumi');
});

test('other players count once two agree; your own notes count at once', () => {
  const rows = [
    { kind: 'need', quest: 'Mystery Errand', item: 'Old Key', count: 3, owner: 'a' },
    { kind: 'drop', item: 'Old Key', value: 'Stump', owner: 'a' },
    { kind: 'drop', item: 'Old Key', value: 'Stump', owner: 'b' },
    { kind: 'drop', item: 'Old Key', value: 'Octopus', owner: 'c' },
    { kind: 'week', quest: 'Donating to Kerning City', item: 'Firewood', week: weekKey(now), owner: 'c' },
    { kind: 'week', quest: 'Donating to Kerning City', item: 'Red Snail Shell', week: '2026-W01', owner: 'd' }
  ];
  const others = mergeNotes(rows, 'me', now);
  assert.equal(others.needs['Mystery Errand'], undefined);
  assert.deepEqual(others.drops['old key'].map(d => d.name), ['Stump']);
  assert.equal(others.weekly['Donating to Kerning City'].item, 'Firewood');
  assert.equal(mergeNotes(rows, 'a', now).needs['Mystery Errand'][0].count, 3);
});

test('this week\'s version: Quest Helper, then your pick, then players', () => {
  const quest = donating[0], notes = mergeNotes([{ kind: 'week', quest: quest.name, item: 'Firewood', week: weekKey(now), owner: 'x' }], 'me', now);
  assert.equal(weekVersion(quest, { helperItems: ['Red Snail Shell'], notes }).by, 'helper');
  assert.equal(weekVersion(quest, { pick: 'Red Snail Shell', notes }).item, 'Red Snail Shell');
  const said = weekVersion(quest, { notes });
  assert.deepEqual([said.item, said.by, said.needs[0].count], ['Firewood', 'players', 30]);
  assert.equal(weekVersion(quest, {}).by, null);
});

test('notes fill gaps but never replace game data', () => {
  const quests = [{ name: 'Mystery Errand', needs: [] }, { name: 'Known', needs: [{ name: 'Leaf', count: 10 }], turnIn: 'Shumi', turnInGuessed: true }];
  const notes = mergeNotes([{ kind: 'need', quest: 'Mystery Errand', item: 'Old Key', count: 3, owner: 'me' }, { kind: 'need', quest: 'Known', item: 'Leaf', count: 99, owner: 'me' }, { kind: 'turnin', quest: 'Known', value: 'Mr. Pickall', owner: 'me' }], 'me', now);
  applyNotes(quests, notes);
  assert.deepEqual(quests[0].needs.map(n => [n.name, n.count]), [['Old Key', 3]]);
  assert.equal(quests[1].needs[0].count, 10);
  assert.equal(quests[1].turnIn, 'Mr. Pickall');
  applyNotes(quests, mergeNotes([], 'me', now));
  assert.deepEqual(quests[0].needs, []);
  const sources = notedSources({ 'Leaf': ['Stump'], 'Old Key': [] }, mergeNotes([{ kind: 'drop', item: 'old key', value: 'Octopus', owner: 'me' }, { kind: 'drop', item: 'Leaf', value: 'Octopus', owner: 'me' }], 'me', now), ['Old Key']);
  assert.deepEqual(sources, { 'Leaf': ['Stump'], 'Old Key': ['Octopus'] });
});

test('quests that are alone in a rotation keep their own needs (daily greetings, crafting weeklies)', () => {
  const out = collapseRotations([
    { id: '1', name: 'First Greeting with Shumi, the Town Resident', rotation: 'Citizenship Kerning City Daily', needs: [] },
    { id: '2', name: 'Silas Irons in Need of Help', rotation: 'Crafting Weekly Quest', needs: [{ name: 'Bubbling', count: 25 }] }
  ]);
  assert.equal(out.length, 2);
  assert.equal(out[0].variants, undefined);
  assert.deepEqual(out[1].needs, [{ name: 'Bubbling', count: 25 }]);
});
