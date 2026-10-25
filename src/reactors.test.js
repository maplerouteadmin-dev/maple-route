import test from 'node:test';
import assert from 'node:assert/strict';
import { parseReactorLocations, parseReactorDrops, reactorTargets } from './reactors.js';

const page = `== Locations ==
{| class="wikitable sortable"
! Map !! Count
|-
| {{map|The Forest North of Ellinia}} || 24
|-
| {{map|The Field Up North of Ellinia}} || 6
|-
| {{map|The Tree That Grew I}} || 5
|}`;

test('reactor locations come from the wiki page table', () => {
  assert.deepEqual(parseReactorLocations(page), [
    { map: 'The Forest North of Ellinia', count: 24 }, { map: 'The Field Up North of Ellinia', count: 6 }, { map: 'The Tree That Grew I', count: 5 }
  ]);
});

test('Plant Samples come from Ellinia Flowers, as a target the planner can send you to', () => {
  const drops = parseReactorDrops({ cargoquery: [{ title: { 'reactor id': 'Ellinia Flower', 'item id': 'Plant Sample', 'drop rate': '33.33', 'required quest': 'Research on Plant Fossils' } }] });
  assert.equal(drops[0].reactor, 'Ellinia Flower');
  const data = { maps: [{ id: 'north', name: 'The Forest North of Ellinia', area: 'Victoria Road' }, { id: 'field', name: 'The Field Up North of Ellinia', area: 'Victoria Road' }] };
  const [target] = reactorTargets(data, [{ ...drops[0], locations: parseReactorLocations(page) }]);
  assert.equal(target.kind, 'mob'); assert.equal(target.reactor, true);
  assert.deepEqual(target.locations, [{ mapId: 'north', count: 24 }, { mapId: 'field', count: 6 }]);
});
