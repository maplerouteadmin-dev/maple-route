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

test('one trip for several quests: each quest handed in on the way when its hunting is done', async () => {
  const { planMultiTrip } = await import('./objective.js');
  // start - perion - rocky(Winston) - east(Green Mushroom, Axe Stump) ; start - kerning(Luke) - swamp(Jr. Necki, Stirge)
  const world = validateDataset({ schemaVersion: 1, maps: ['start', 'perion', 'rocky', 'east', 'kerning', 'swamp'].map(id => ({ id, name: id })), portals: [
    ['start', 'perion'], ['perion', 'rocky'], ['rocky', 'east'], ['start', 'kerning'], ['kerning', 'swamp']
  ].flatMap(([a, b], i) => [{ from: a, to: b, name: `p${i}` }, { from: b, to: a, name: `q${i}` }]), targets: [
    { id: 'g', name: 'Green Mushroom', kind: 'mob', locations: [{ mapId: 'east', count: 20 }] },
    { id: 'a', name: 'Axe Stump', kind: 'mob', locations: [{ mapId: 'east', count: 20 }] },
    { id: 'n', name: 'Jr. Necki', kind: 'mob', locations: [{ mapId: 'swamp', count: 10 }] },
    { id: 't', name: 'Stirge', kind: 'mob', locations: [{ mapId: 'swamp', count: 10 }] }
  ] });
  const goals = [
    { name: 'Green Mushroom', need: 25, monsters: ['Green Mushroom'], quests: ['Fossils'] }, { name: 'Axe Stump', need: 25, monsters: ['Axe Stump'], quests: ['Fossils'] },
    { name: 'Jr. Necki', need: 20, monsters: ['Jr. Necki'], quests: ['Luke'] }, { name: 'Stirge', need: 20, monsters: ['Stirge'], quests: ['Luke'] }
  ];
  const trip = planMultiTrip(world, goals, 'start', [{ mapId: 'rocky', quests: ['Fossils'] }, { mapId: 'kerning', quests: ['Luke'] }]);
  // Fossils hunted first (more spawns), handed in to Winston right next door, then Luke's hunt and hand-in.
  assert.deepEqual(trip.order.map(o => `${o.type}:${o.mapId}`), ['hunt:east', 'handin:rocky', 'hunt:swamp', 'handin:kerning']);
  assert.equal(trip.hops, 3 + 1 + 4 + 1);
  assert.deepEqual([trip.stops.length, trip.ends, trip.missing], [2, ['rocky', 'kerning'], []]);
  // Plain map ids still work (no quest names: every hand-in waits until the end).
  assert.deepEqual(planMultiTrip(world, goals, 'start', ['rocky', 'kerning']).order.map(o => o.type), ['hunt', 'hunt', 'handin', 'handin']);
});

test('a hunting map needs enough of the monster for what is left (25 kills: not a map with 2)', async () => {
  const { minSpawns, goalSpawns, planMultiTrip } = await import('./objective.js');
  assert.deepEqual([minSpawns({ need: 25 }), minSpawns({ need: 25, have: 20 }), minSpawns({ need: 12 }), minSpawns({ need: 1 })], [8, 4, 6, 2]);
  const world = validateDataset({ schemaVersion: 1, maps: ['start', 'near', 'far'].map(id => ({ id, name: id })), portals: [
    ['start', 'near'], ['near', 'far']
  ].flatMap(([a, b], i) => [{ from: a, to: b, name: `p${i}` }, { from: b, to: a, name: `q${i}` }]), targets: [
    { id: 'g', name: 'Green Mushroom', kind: 'mob', locations: [{ mapId: 'near', count: 2 }, { mapId: 'far', count: 14 }] },
    { id: 'r', name: 'Rare Boss', kind: 'mob', locations: [{ mapId: 'near', count: 1 }] }
  ] });
  const mushrooms = { name: 'Green Mushroom', need: 25, monsters: ['Green Mushroom'], quests: ['Fossils'] };
  assert.deepEqual([...goalSpawns(world, mushrooms).keys()], ['far']);
  assert.deepEqual([...goalSpawns(world, { ...mushrooms, need: 1 }).keys()], ['near', 'far']); // one left: 2 is enough
  assert.deepEqual([...goalSpawns(world, { name: 'Rare Boss', need: 5, monsters: ['Rare Boss'] }).keys()], ['near']); // nowhere better: still listed
  assert.deepEqual(planMultiTrip(world, [mushrooms], 'start', []).stops.map(s => s.mapId), ['far']);
});

test('spawns count what can be alive at once (the map mob cap)', async () => {
  const { goalSpawns } = await import('./objective.js');
  // East Domain of Perion: 71 spawn points, 40 alive at once; 12 of the points are Green Mushrooms.
  const world = validateDataset({ schemaVersion: 1, maps: [{ id: 'east', name: 'East Domain of Perion', capacity: 40 }, { id: 'wisdom', name: 'The Forest of Wisdom', capacity: 31 }], portals: [], targets: [
    { id: 'g', name: 'Green Mushroom', kind: 'mob', locations: [{ mapId: 'east', count: 12 }, { mapId: 'wisdom', count: 30 }] },
    { id: 'o', name: 'Other', kind: 'mob', locations: [{ mapId: 'east', count: 59 }, { mapId: 'wisdom', count: 28 }] }
  ] });
  const spawns = goalSpawns(world, { name: 'Green Mushroom', need: 25, monsters: ['Green Mushroom'] });
  assert.deepEqual([...spawns], [['wisdom', 16]]); // about 7 alive at East Domain: below the 8 needed for 25
  assert.equal(world.maps[0].capacity, 40);
});

test('quests not started yet: picked up at the giver before hunting for them, handed in after', async () => {
  const { planMultiTrip } = await import('./objective.js');
  // town(giver Mrs. Ming Ming) - field(Pigs) ; town - shop(delivery NPC)
  const world = validateDataset({ schemaVersion: 1, maps: ['start', 'town', 'field', 'shop'].map(id => ({ id, name: id })), portals: [
    ['start', 'town'], ['town', 'field'], ['town', 'shop']
  ].flatMap(([a, b], i) => [{ from: a, to: b, name: `p${i}` }, { from: b, to: a, name: `q${i}` }]), targets: [
    { id: 'p', name: 'Pig', kind: 'mob', locations: [{ mapId: 'field', count: 16 }] }
  ] });
  const goals = [{ name: 'Pig', need: 10, monsters: ['Pig'], quests: ['Ribbons'] }];
  const trip = planMultiTrip(world, goals, 'start', [{ mapId: 'town', quests: ['Ribbons'] }, { mapId: 'shop', quests: ['Delivery'] }],
    { starts: [{ mapId: 'town', quests: ['Ribbons'], npc: 'Mrs. Ming Ming' }, { mapId: 'town', quests: ['Delivery'], npc: 'Sera' }] });
  const types = trip.order.map(o => `${o.type}:${o.mapId}:${o.quests.join('+')}`);
  assert.ok(types.indexOf('start:town:Ribbons') < types.indexOf('hunt:field:Ribbons'));
  assert.ok(types.indexOf('hunt:field:Ribbons') < types.indexOf('handin:town:Ribbons'));
  assert.ok(types.indexOf('start:town:Delivery') < types.indexOf('handin:shop:Delivery'));
  // A talk-only plan (nothing to hunt) still makes a trip.
  assert.deepEqual(planMultiTrip(world, [], 'start', [{ mapId: 'shop', quests: ['Delivery'] }], { starts: [{ mapId: 'town', quests: ['Delivery'] }] }).order.map(o => o.type), ['start', 'handin']);
});

