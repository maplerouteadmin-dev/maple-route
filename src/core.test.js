import test from 'node:test';
import assert from 'node:assert/strict';
import { validateDataset, shortestRoute, matchMap, portalPosition } from './core.js';
import { fromOsms } from './osms.js';
import { rankGrindMaps } from './guide.js';
import { parseWikiDrops, rankFarmMaps } from './items.js';
import { guideForLevel, resolveGuideMaps } from './classic-guide.js';
import { atlasNeighbors } from './atlas.js';

const world = validateDataset({ schemaVersion: 1, maps: [
  { id: 'a', name: 'Lith Harbor' }, { id: 'b', name: 'Path One' },
  { id: 'c', name: 'Path Two' }, { id: 'd', name: 'Henesys' }
], portals: [
  { from: 'a', to: 'b', name: 'East', cost: 1 },
  { from: 'b', to: 'd', name: 'East', cost: 1 },
  { from: 'a', to: 'c', name: 'North', cost: 1 },
  { from: 'c', to: 'd', name: 'East', cost: 5 }
] });

test('routes through the lowest cost directed portal sequence', () => {
  assert.deepEqual(shortestRoute(world, 'a', 'd').map(p => p.to), ['b', 'd']);
  assert.equal(shortestRoute(world, 'd', 'a'), null);
});
test('rejects broken portal references', () => {
  assert.throws(() => validateDataset({ schemaVersion: 1, maps: [{ id: 'a', name: 'A' }], portals: [{ from: 'a', to: 'missing', name: 'Exit' }] }));
});
test('recognizes a visible map label and leaves ambiguous words as candidates', () => {
  assert.equal(matchMap('Victoria Island / Lith Harbor', world.maps)[0].map.id, 'a');
  assert.equal(matchMap('Victoria Road\n\nHenesys', world.maps)[0].map.id, 'd');
  assert.deepEqual(matchMap('unreadable', world.maps), []);
});
test('adapts public map and portal shapes, ignoring event and dead-end links', () => {
  const data = fromOsms({ regions: [
    { region: 'Victoria', maps: [{ id: 100, name: 'Start' }, { id: 101, name: 'Finish' }] },
    { region: 'Event', maps: [{ id: 900, name: 'Event' }] }
  ] }, { '000000100': [{ name: 'out00', dest_map: '101', x: 40 }, { name: 'dead', dest_map: '999999999' }] });
  assert.equal(data.maps.length, 2);
  assert.equal(data.portals.length, 1);
  assert.equal(shortestRoute(data, '000000100', '000000101')[0].name, 'out00');
});
test('keeps NPC and monster locations and ranks level-appropriate training maps', () => {
  const data = fromOsms({ regions: [{ region: 'Victoria', maps: [
    { id: 100, name: 'Start', npcs: [1] }, { id: 101, name: 'Field' }
  ] }], npc_lookup: { '1': { name: 'Guide' } } }, {}, { monsters: [
    { id: 10, name: 'Snail', level: 10, hp: 20, exp: 10, maps: [{ id: 101, count: 20 }] }
  ] });
  assert.equal(data.targets.length, 2);
  assert.equal(data.targets.find(target => target.kind === 'npc').locations[0].mapId, '000000100');
  assert.equal(rankGrindMaps(data, 10, 'xp')[0].map.id, '000000101');
  assert.equal(rankGrindMaps(data, 50, 'xp').length, 0);
});
test('describes portal position in everyday map directions', () => {
  const map = { bounds: { minX: 0, maxX: 1000, minY: 0, maxY: 1000 } };
  assert.equal(portalPosition({ name: 'in00', x: 900, y: 100 }, map), 'top-right');
  assert.equal(portalPosition({ name: 'west00', x: null, y: null }, map), 'left');
  assert.equal(portalPosition({ name: 'in00', x: null, y: null }, map), null);
});
test('turns documented item drops into multiple farming-map choices', () => {
  const data = fromOsms({ regions: [{ region: 'Victoria', maps: [
    { id: 100, name: 'Town' }, { id: 101, name: 'Near Field' }, { id: 102, name: 'Far Field' }
  ] }] }, { '000000100': [{ name: 'east00', dest_map: 101 }], '000000101': [{ name: 'east00', dest_map: 102 }] }, { monsters: [
    { id: 1, name: 'Blue Snail', level: 2, maps: [{ id: 101, count: 12 }, { id: 102, count: 30 }] }
  ] });
  const drops = parseWikiDrops({ cargoquery: [{ title: { 'monster id': 'Blue Snail' } }, { title: { 'monster id': 'Blue Snail' } }] });
  assert.deepEqual(drops, ['Blue Snail']);
  const ranked = rankFarmMaps(data, drops, '000000100');
  assert.equal(ranked.spots.length, 2);
  assert.equal(ranked.spots[0].map.name, 'Far Field');
  assert.equal(ranked.spots[0].hops, 2);
  assert.deepEqual(ranked.unmapped, []);
});
test('classic journey follows level brackets and resolves routeable maps', () => {
  assert.equal(guideForLevel(15).title, 'First job, easy mushrooms');
  assert.equal(guideForLevel(56), null);
  const maps = resolveGuideMaps({ maps: [{ id: 'x', name: 'Henesys Hunting Ground III' }] }, guideForLevel(15));
  assert.equal(maps[1].map.id, 'x');
  const island = resolveGuideMaps({ maps: [
    { id: 'victoria', name: 'Mushroom Garden', area: 'Victoria Island' },
    { id: 'maple', name: 'Mushroom Garden', area: 'Maple Island' }
  ] }, guideForLevel(5));
  assert.equal(island[1].map.id, 'maple');
});
test('atlas distinguishes outgoing from incoming-only portals', () => {
  const graph = { maps: [{ id: 'a', name: 'Town' }, { id: 'b', name: 'Field' }, { id: 'c', name: 'Cave' }], portals: [
    { from: 'a', to: 'b' }, { from: 'b', to: 'a' }, { from: 'c', to: 'a' }
  ] };
  const { neighbors } = atlasNeighbors(graph, 'a');
  assert.deepEqual(neighbors.map(({ map, outgoing, incoming }) => [map.name, outgoing, incoming]), [['Field', true, true], ['Cave', false, true]]);
});

test('roman numerals: OCR l/1 runs and whole-word containment pick the right hunting ground', () => {
  const grounds = validateDataset({ schemaVersion: 1, maps: [
    { id: 'g1', name: 'Henesys Hunting Ground I', aliases: ['Victoria Road Henesys Hunting Ground I'] },
    { id: 'g2', name: 'Henesys Hunting Ground II', aliases: ['Victoria Road Henesys Hunting Ground II'] },
    { id: 'g3', name: 'Henesys Hunting Ground III', aliases: ['Victoria Road Henesys Hunting Ground III'] }
  ], portals: [] }).maps;
  for (const [ocr, id] of [['Victoria Road Henesys Hunting Ground Il', 'g2'], ['Victoria Road Henesys Hunting Ground ll', 'g2'], ['Victoria Road Henesys Hunting Ground 111', 'g3'], ['Victoria Road Henesys Hunting Ground I', 'g1'], ['Victoria Road Henesys Hunting Ground II', 'g2'], ['Victoria Road Henesys Hunting Ground |', 'g1'], ['Victoria Road Henesys Hunting Ground ||', 'g2']])
    assert.equal(matchMap(ocr, grounds)[0].map.id, id, ocr);
});

test('a cut-off map line never falls back to the area name on the first line', () => {
  const maps = validateDataset({ schemaVersion: 1, maps: [{ id: 'vr', name: 'Victoria Road' }, { id: 'wr', name: 'West Rocky Mountain I', aliases: ['Victoria Road West Rocky Mountain I'] }], portals: [] }).maps;
  assert.equal(matchMap('Victoria Road\nWest Rocky Mow', maps).some(m => m.map.id === 'vr'), false);
  assert.equal(matchMap('Victoria Road', maps)[0].map.id, 'vr');
  assert.equal(matchMap('Victoria Road : West Rocky Mountain I', maps)[0].map.id, 'wr');
  assert.equal(matchMap('Victona Road Wesl Rocky Mountain', maps).some(m => m.map.id === 'vr'), false);
});

test('a near-complete longer name beats the shorter name it contains', () => {
  const maps = validateDataset({ schemaVersion: 1, maps: [{ id: 'el', name: 'Ellinia' }, { id: 'ds', name: 'Ellinia Department Store', aliases: ['Victoria Road Ellinia Department Store'] }, { id: 'vr', name: 'Victoria Road' }], portals: [] }).maps;
  assert.equal(matchMap('Victoria Road Ellinia Department Stor', maps)[0].map.id, 'ds');
  assert.equal(matchMap('Victoria Road\nEllinia', maps)[0].map.id, 'el');
});

test('exact map line beats a shorter map name inside it by enough for live GPS confirmation', () => {
  const maps = validateDataset({ schemaVersion: 1, maps: [
    { id: 'short', name: 'Deep Forest' },
    { id: 'long', name: 'Swampy Land in a Deep Forest' }
  ], portals: [] }).maps;
  const matches = matchMap('Dungeon\nSwampy Land in a Deep Forest', maps);
  assert.equal(matches[0].map.id, 'long');
  assert.ok(matches[0].score - matches[1].score > .03);
});

test('a bar glued to the end of a map name is the roman numeral I', () => {
  const maps = validateDataset({ schemaVersion: 1, maps: [{ id: 'l1', name: 'L Forest I' }, { id: 'l2', name: 'L Forest II' }, { id: 'l3', name: 'L Forest III' }], portals: [] }).maps;
  assert.equal(matchMap('Victoria Road\nL Forest|', maps)[0].map.id, 'l1');
  assert.equal(matchMap('Victoria Road\nL Forest||', maps)[0].map.id, 'l2');
});

test('a numeral glued to the last word is read as the numeral', () => {
  const maps = validateDataset({ schemaVersion: 1, maps: [{ id: 'l1', name: 'L Forest I' }, { id: 'l2', name: 'L Forest II' }, { id: 'h', name: 'Windy Hill' }], portals: [] }).maps;
  assert.equal(matchMap('Victoria Road\nL Forestll', maps)[0].map.id, 'l2');
  assert.equal(matchMap('Victoria Road\nL Forest||', maps)[0].map.id, 'l2');
  assert.equal(matchMap('Windy Hill', maps)[0].map.id, 'h');
});

test('neighboring Roman-numbered Swamp maps do not match each other on complete titles', () => {
  const maps = ['Swamp of Despair II', 'Swamp of Despair III'].map((name, index) => ({ id: String(index), name, aliases: [] }));
  assert.equal(matchMap('Victoria Road\nSwamp of Despair III', maps, '0')[0].map.id, '1');
  assert.equal(matchMap('Victoria Road\nSwamp of Despair lll', maps, '0')[0].map.id, '1');
  assert.equal(matchMap('Victoria Road\nSwamp of Despair II', maps, '1')[0].map.id, '0');
});
