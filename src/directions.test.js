import test from 'node:test';
import assert from 'node:assert/strict';
import { validateDataset, shortestRoute } from './core.js';
import { fromOsms } from './osms.js';
import { routeWithPreference, explainNoRoute } from './routing.js';
import { describeStep } from './directions.js';

const osms = fromOsms({ regions: [{ region: 'Victoria Island', maps: [
  { id: 100, name: 'Henesys', npc_positions: [{ id: 200, x: 800, y: 870 }] }, { id: 101, name: 'Henesys Market' }, { id: 102, name: 'Empty House' },
  { id: 200, name: 'Kerning City', npc_positions: [{ id: 400, x: 4400, y: 1650 }] }, { id: 300, name: 'Kerning City Subway' }, { id: 301, name: 'B1 Subway Depot' },
  { id: 400, name: 'Lith Harbor', npc_positions: [{ id: 101, x: 1750, y: 1560 }] }
] }], npc_lookup: { 101: { name: 'Phil' }, 200: { name: 'Regular Cab' }, 400: { name: 'Regular Cab' } } }, {
  100: [
    { type: 2, name: 'in00', dest_map: 101, dest_portal: 'out00', x: 3700, y: 930 },
    { type: 1, name: 'in03', dest_map: 102, dest_portal: 'out00', x: 1000, y: 500 },
    { type: 1, name: 'cab00', dest_map: 999999999, x: 720, y: 870 }
  ],
  101: [{ type: 2, name: 'out00', dest_map: 100, dest_portal: 'in00', x: 100, y: 200 }, { type: 2, name: 'in00', dest_map: 102, dest_portal: 'out00', x: 1500, y: 200 }],
  102: [{ type: 2, name: 'out00', dest_map: 101, x: 50, y: 0 }],
  200: [{ type: 2, name: 'in00', dest_map: 300, x: 900, y: 100 }],
  300: [{ type: 2, name: 'out00', dest_map: 200, x: 10, y: 0 }],
  301: [{ type: 2, name: 'out00', dest_map: 300, x: 10, y: 0 }],
  400: [{ type: 2, name: 'west00', dest_map: 400, x: 0, y: 0 }]
});

test('OSMS portals keep their kind and arrival portal, and NPC rides come from the wiki table', () => {
  const hidden = osms.portals.find(p => p.name === 'in03');
  assert.equal(hidden.kind, 'hidden'); assert.equal(hidden.cost, 6); assert.equal(hidden.arrive, 'out00');
  const rides = osms.portals.filter(p => p.kind === 'taxi').map(p => `${p.npc}:${p.from}>${p.to}`).sort();
  assert.deepEqual(rides, ['Phil:000000400>000000100', 'Phil:000000400>000000200', 'Regular Cab:000000100>000000200', 'Regular Cab:000000100>000000400', 'Regular Cab:000000200>000000100', 'Regular Cab:000000200>000000400']);
  const cab = osms.portals.find(p => p.npc === 'Regular Cab' && p.from === '000000100' && p.to === '000000200');
  assert.deepEqual(cab.fare, [600, 1200]); assert.equal(cab.x, 800);
  assert.deepEqual(osms.maps.find(m => m.id === '000000100').marks, [{ x: 3700, y: 930 }]);
});

test('Phil rides one way: no ride back to Lith Harbor from his list', () => {
  assert.equal(osms.portals.some(p => p.npc === 'Phil' && p.to === '000000400'), false);
});

test('routes avoid hidden portals when a visible path exists and use taxis between towns', () => {
  assert.deepEqual(shortestRoute(osms, '000000100', '000000102').map(p => p.name), ['in00', 'in00']);
  const toSubway = routeWithPreference(osms, '000000100', '000000300');
  assert.deepEqual(toSubway.map(p => p.kind), ['taxi', 'visible']);
  assert.equal(routeWithPreference(osms, '000000100', '000000300', 'fewest', 30, { taxis: false }), null);
});

test('steps explain the kind of exit and the arrival side', () => {
  const [first, second] = shortestRoute(osms, '000000100', '000000102');
  const words = describeStep(osms, first, second);
  assert.match(words.headline, /^Take the [a-z-]* ?portal to Henesys Market$/);
  assert.equal(words.arrival, 'You arrive on the left side of Henesys Market; the next exit is to your right.');
  const taxi = describeStep(osms, osms.portals.find(p => p.npc === 'Regular Cab' && p.to === '000000200'), null, { level: 25 });
  assert.match(taxi.headline, /Regular Cab to Kerning City/);
  assert.match(taxi.how, /Fare 1,200 mesos at level 25/);
  assert.equal(describeStep(osms, osms.portals.find(p => p.npc === 'Phil' && p.to === '000000100')).headline, 'Ride with Phil to Henesys');
  const hidden = describeStep(osms, osms.portals.find(p => p.name === 'in03'));
  assert.match(hidden.how, /no swirl/);
});

test('explains maps that are only reached through an NPC', () => {
  assert.equal(shortestRoute(osms, '000000100', '000000301'), null);
  const why = explainNoRoute(osms, '000000100', '000000301');
  assert.equal(why.nearest.name, 'Kerning City Subway');
});

test('older cached data without kinds still validates as visible portals', () => {
  const data = validateDataset({ schemaVersion: 1, maps: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }], portals: [{ from: 'a', to: 'b', name: 'x' }] });
  assert.equal(data.portals[0].kind, 'visible');
});
