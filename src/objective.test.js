import test from 'node:test';
import assert from 'node:assert/strict';
import { validateDataset } from './core.js';
import { huntGoals, rankObjectiveMaps, questObjective, planHuntTrip, textMonsters } from './objective.js';

const data = validateDataset({ schemaVersion: 1, maps: [
  { id: 'el', name: 'Ellinia' }, { id: 'df', name: 'Deep Forest' }, { id: 'hg', name: 'Hunting Ground in the Deep Forest I' }, { id: 'sw', name: 'Swampy Land' }
], portals: [
  { from: 'el', to: 'df', name: 'a' }, { from: 'df', to: 'el', name: 'b' }, { from: 'df', to: 'hg', name: 'c' }, { from: 'hg', to: 'df', name: 'd' }, { from: 'df', to: 'sw', name: 'e' }, { from: 'sw', to: 'df', name: 'f' }
], targets: [
  { id: 'm1', name: 'Dark Stump', kind: 'mob', level: 10, locations: [{ mapId: 'df', count: 8 }, { mapId: 'hg', count: 14 }] },
  { id: 'm2', name: 'Stump', kind: 'mob', level: 7, locations: [{ mapId: 'hg', count: 6 }, { mapId: 'sw', count: 10 }] },
  { id: 'n1', name: 'Francois', kind: 'npc', locations: [{ mapId: 'el' }] }
] });

const helper = { progress: [{ name: 'Leaf', have: 4, need: 20, done: false }, { name: 'Dark Stump', have: 0, need: 30, done: false }], complete: false };

test('unfinished counts become kill and collect goals', () => {
  const goals = huntGoals(data, helper.progress, { Leaf: ['Stump', 'Dark Stump', 'Unknown Mob'] });
  assert.deepEqual(goals.map(g => [g.name, g.kind, g.monsters]), [['Leaf', 'collect', ['Stump', 'Dark Stump']], ['Dark Stump', 'kill', ['Dark Stump']]]);
  assert.equal(huntGoals(data, helper.progress, {})[0].pending, true);
});

test('the map covering every remaining goal ranks first', () => {
  const goals = huntGoals(data, helper.progress, { Leaf: ['Stump'] });
  const ranked = rankObjectiveMaps(data, goals, 'el');
  assert.equal(ranked[0].mapId, 'hg'); // Dark Stump and Stump both spawn there
  assert.deepEqual(ranked[0].goals.sort(), ['Dark Stump', 'Leaf']);
});

test('hunting keeps you on a useful map; completion sends you to hand in', () => {
  const sources = { Leaf: ['Stump'] };
  const away = questObjective(data, { quest: 'Francois in Need of an Apprentice', helperQuest: helper, catalogQuest: { turnIn: 'Francois' }, itemSources: sources, currentMapId: 'el' });
  assert.equal(away.stage, 'hunt'); assert.equal(away.mapId, 'hg'); assert.equal(away.here, false);
  const onDeepForest = questObjective(data, { quest: 'x', helperQuest: helper, catalogQuest: { turnIn: 'Francois' }, itemSources: sources, currentMapId: 'df' });
  assert.equal(onDeepForest.here, true); assert.equal(onDeepForest.mapId, 'df'); // Dark Stumps spawn here: hunt, do not leave
  const done = questObjective(data, { quest: 'x', helperQuest: { progress: [{ name: 'Leaf', have: 20, need: 20, done: true }], complete: true }, catalogQuest: { turnIn: 'Francois' }, currentMapId: 'hg' });
  assert.deepEqual([done.stage, done.npc, done.mapId, done.here], ['turn-in', 'Francois', 'el', false]);
});

test('without the Quest Helper, the game data says what to hunt, and talk quests go to the hand-in NPC', async () => {
  const { questObjective } = await import('./objective.js');
  const data = { maps: [{ id: 'f' }, { id: 'e' }], portals: [{ from: 'e', to: 'f', name: 'east00', cost: 1 }], targets: [
    { kind: 'mob', name: 'Green Mushroom', locations: [{ mapId: 'f', count: 20 }] },
    { kind: 'npc', name: 'Shane', locations: [{ mapId: 'e' }] }
  ] };
  const hunt = questObjective(data, { quest: 'Q', catalogQuest: { giver: 'Shane', turnIn: 'Shane', needs: [{ type: 'mob', name: 'Green Mushroom', count: 30 }] }, currentMapId: 'e' });
  assert.equal(hunt.stage, 'hunt'); assert.equal(hunt.mapId, 'f'); assert.equal(hunt.countsUnknown, true);
  const talk = questObjective(data, { quest: 'Q', catalogQuest: { giver: 'Shane', needs: [] } });
  assert.equal(talk.stage, 'turn-in'); assert.equal(talk.mapId, 'e');
  assert.equal(questObjective(data, { quest: 'Q', catalogQuest: { giver: 'Shane', needs: [{ type: 'mob', name: 'Green Mushroom', count: 30 }] }, handIn: true }).stage, 'turn-in');
});

test('items the wiki has no drops for are matched to monsters named in the quest text', () => {
  const omok = validateDataset({ schemaVersion: 1, maps: [{ id: 'a', name: 'A' }], portals: [], targets: [
    { id: 'o', name: 'Orange Mushroom', kind: 'mob', locations: [{ mapId: 'a', count: 5 }] },
    { id: 's', name: 'Stump', kind: 'mob', locations: [{ mapId: 'a', count: 5 }] },
    { id: 'p', name: 'Octopus', kind: 'mob', locations: [{ mapId: 'a', count: 5 }] }
  ] });
  const text = 'He said I can get them by defeating Stump, Orange Mushroom, and Octopus, found around Henesys.';
  assert.deepEqual(textMonsters(omok, text).sort(), ['Octopus', 'Orange Mushroom', 'Stump']);
  const progress = [{ name: 'Omok Table', have: 0, need: 1 }, { name: 'Omok Piece: Octopus', have: 1, need: 1, done: true }, { name: 'Omok Piece: Mushroom', have: 0, need: 1 }];
  const goals = huntGoals(omok, progress, { 'Omok Table': [], 'Omok Piece: Mushroom': [], 'Omok Piece: Octopus': ['Octopus'] }, text);
  assert.deepEqual(goals.map(g => [g.name, g.monsters, g.guess]), [['Omok Table', ['Stump'], true], ['Omok Piece: Mushroom', ['Orange Mushroom'], true]]);
  assert.equal(huntGoals(omok, progress, { 'Omok Table': [] }, '')[0].monsters.length, 0); // no text: no guess
});

test('the hunting trip can split needs over two maps and counts the walk to the hand-in', () => {
  // home(NPC) - hill(Stumps 16) - garden(Mushrooms 15); far map has a few of both.
  const world = validateDataset({ schemaVersion: 1, maps: ['home', 'hill', 'garden', 'far', 'start'].map(id => ({ id, name: id })), portals: [
    ['start', 'home'], ['home', 'hill'], ['hill', 'garden'], ['start', 'far'], ['far', 'home']
  ].flatMap(([a, b], i) => [{ from: a, to: b, name: `p${i}` }, { from: b, to: a, name: `q${i}` }]), targets: [
    { id: 's', name: 'Stump', kind: 'mob', locations: [{ mapId: 'hill', count: 16 }, { mapId: 'far', count: 3 }] },
    { id: 'o', name: 'Orange Mushroom', kind: 'mob', locations: [{ mapId: 'garden', count: 15 }, { mapId: 'far', count: 2 }] }
  ] });
  const goals = [{ name: 'Table', kind: 'collect', monsters: ['Stump'] }, { name: 'Piece', kind: 'collect', monsters: ['Orange Mushroom'] }];
  const trip = planHuntTrip(world, goals, 'start', 'home');
  assert.deepEqual(trip.stops.map(s => s.mapId), ['hill', 'garden']);
  assert.equal(trip.hops, 5); // start→home→hill→garden, then back through hill to home
  assert.equal(trip.endMapId, 'home');
});

test('Quest Helper counts match the whole item name, and a hidden line keeps a quest incomplete', async () => {
  const { matchCount, believableDone, helperComplete } = await import('./objective.js');
  const progress = [{ name: 'Omok Table', have: 1, need: 1, done: true }, { name: 'Omok Fiece Octopus', have: 1, need: 1, done: true }, { name: 'Omok Piece Muzhroom', have: 0, need: 1, done: false }];
  assert.equal(matchCount(progress, 'Omok Piece: Mushroom').have, 0);
  assert.equal(matchCount(progress, 'Omok Piece: Octopus').have, 1);
  assert.equal(matchCount(progress, 'Omok Table').have, 1);
  assert.equal(matchCount(progress, 'Stirge Wing'), null);
  assert.equal(matchCount([{ name: 'Omok Piece Octopus', have: 1, need: 1 }], 'Omok Piece: Mushroom'), null); // only the other piece on screen
  assert.equal(believableDone({ have: 7, need: 1, done: true }), false);
  assert.equal(believableDone({ have: 1, need: 1, done: true }), true);
  assert.equal(believableDone({ have: 20, need: 20, done: true }), true);
  const wrapped = { progress: progress.slice(0, 2) }; // the Mushroom line was read as its own heading
  assert.equal(helperComplete(wrapped, 3), false);
  assert.equal(helperComplete(wrapped), true);
});

test('short monster names count, and finished needs still claim their monster', () => {
  const world = validateDataset({ schemaVersion: 1, maps: [{ id: 'a', name: 'A' }], portals: [], targets: ['Pig', 'Stump', 'Octopus', 'Ribbon Pig'].map((name, i) => ({ id: `m${i}`, name, kind: 'mob', locations: [{ mapId: 'a', count: 5 }] })) });
  const text = 'He said I can easily get them by defeating Stump, Pig, and Octopus, found around Henesys and Kerning City.';
  // The Octopus piece is ticked off, so only the table and the Pig piece are still listed.
  const progress = [{ name: 'Omok Table', have: 0, need: 1 }, { name: 'Omok Piece: Pig', have: 0, need: 1 }];
  const goals = huntGoals(world, progress, { 'Omok Table': [], 'Omok Piece: Pig': [] }, text, ['Omok Table', 'Omok Piece: Pig', 'Omok Piece: Octopus']);
  assert.deepEqual(goals.map(g => [g.name, g.monsters]), [['Omok Table', ['Stump']], ['Omok Piece: Pig', ['Pig']]]);
});
