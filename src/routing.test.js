import test from 'node:test';
import assert from 'node:assert/strict';
import { validateDataset } from './core.js';
import { routeWithPreference, routeTradeoff, uncertainPortal } from './routing.js';

const data = validateDataset({ schemaVersion: 1, maps: [
  { id: 'a', name: 'Start' }, { id: 'b', name: 'Dangerous' }, { id: 'c', name: 'Calm' },
  { id: 'e', name: 'Bypass' }, { id: 'd', name: 'Finish' }
], portals: [
  { from: 'a', to: 'b', name: 'ordinary' }, { from: 'b', to: 'd', name: 'ordinary' },
  { from: 'a', to: 'c', name: 'hidden gate' }, { from: 'c', to: 'd', name: 'ordinary' },
  { from: 'a', to: 'e', name: 'ordinary' }, { from: 'e', to: 'c', name: 'ordinary' }
], targets: [{ id: 'mob', name: 'Strong mob', kind: 'mob', level: 70, locations: [{ mapId: 'b', count: 5 }] }] });

test('route modes choose different reasonable paths when data supports them', () => {
  assert.deepEqual(routeWithPreference(data, 'a', 'd', 'fewest', 20).map(p => p.to), ['b', 'd']);
  assert.deepEqual(routeWithPreference(data, 'a', 'd', 'level', 20).map(p => p.to), ['c', 'd']);
  assert.deepEqual(routeWithPreference(data, 'a', 'd', 'cautious', 20).map(p => p.to), ['b', 'd']);
  assert.equal(routeWithPreference(data, 'd', 'a'), null);
  assert.deepEqual(routeWithPreference(data, 'a', 'a'), []);
});

test('warnings disclose uncertain exits and high-level maps', () => {
  assert.equal(uncertainPortal(data.portals[2]), true);
  const report = routeTradeoff(data, [data.portals[0], data.portals[1]], 'level', 20);
  assert.equal(report.highMaps, 1);
  assert.equal(report.flagged, 0);
});

test('one travel graph: taxis off drops rides but keeps boats; scrolls add a trip to the nearest town', async () => {
  const { travelGraph } = await import('./routing.js');
  const data = { maps: [{ id: 'a', returnTo: 't' }, { id: 't' }, { id: 's' }], portals: [{ from: 'a', to: 't', kind: 'taxi' }, { from: 's', to: 't', kind: 'taxi', boat: true }] };
  assert.equal(travelGraph(data, { taxis: false }).portals.length, 1);
  const withScrolls = travelGraph(data, { taxis: false, nearest: true });
  assert.ok(!travelGraph(data, { taxis: false, towns: true }).portals.some(p => p.name === 'Return Scroll - Nearest Town'));
  assert.ok(withScrolls.portals.some(p => p.kind === 'scroll' && p.from === 'a' && p.to === 't'));
  assert.equal(travelGraph(data, { taxis: false }), travelGraph(data, { taxis: false }), 'cached');
});

test('town scrolls go to each town from anywhere', async () => {
  const { travelGraph } = await import('./routing.js');
  const data = { maps: [{ id: 'f', name: 'Field', returnTo: 'h' }, { id: 'h', name: 'Henesys', area: 'Victoria Island' }, { id: 'p', name: 'Perion', area: 'Victoria Island' }], portals: [] };
  const names = travelGraph(data, { nearest: true, towns: true }).portals.filter(p => p.from === 'f').map(p => p.name).sort();
  assert.deepEqual(names, ['Return Scroll - Nearest Town', 'Return Scroll to Perion']);
});

test('routes use only the town scrolls the player confirmed', async () => {
  const { travelGraph } = await import('./routing.js');
  const data = { maps: [{ id: 'f', name: 'Field', returnTo: 'h' }, { id: 'h', name: 'Henesys', area: 'Victoria Island' }, { id: 's', name: 'Sleepywood', area: 'Victoria Island' }], portals: [] };
  const names = options => travelGraph(data, options).portals.filter(p => p.from === 'f').map(p => p.name);
  assert.deepEqual(names({ nearest: false, towns: ['Henesys'] }), ['Return Scroll to Henesys']);
  assert.deepEqual(names({ nearest: false, towns: ['Sleepywood'] }), ['Return Scroll to Sleepywood']);
  assert.deepEqual(names({ nearest: false, towns: [] }), []);
  assert.notEqual(travelGraph(data, { towns: ['Henesys'] }), travelGraph(data, { towns: ['Sleepywood'] }));
});

test('the VIP Cab has its own switch, apart from regular taxis', async () => {
  const { travelGraph } = await import('./routing.js');
  const data = { maps: [{ id: 'l', name: 'Lith' }, { id: 'h', name: 'Henesys' }, { id: 'a', name: 'Ant Tunnel Park' }], portals: [
    { from: 'l', to: 'h', name: 'Phil', kind: 'taxi', npc: 'Phil', cost: 3 },
    { from: 'l', to: 'a', name: 'VIP Cab', kind: 'taxi', npc: 'VIP Cab', cost: 8 }
  ] };
  const names = options => travelGraph(data, options).portals.map(p => p.npc).sort();
  assert.deepEqual(names({ taxis: true, vip: false }), ['Phil']);
  assert.deepEqual(names({ taxis: false, vip: true }), ['VIP Cab']);
  assert.deepEqual(names({ taxis: true }), ['Phil', 'VIP Cab']);
});

