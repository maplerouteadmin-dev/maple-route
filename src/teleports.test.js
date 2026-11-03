import test from 'node:test';
import assert from 'node:assert/strict';
import { mapTeleports, teleportHint } from './teleports.js';
import { validateDataset } from './core.js';

// Utah's Pig Farm (OSMS portal feed, trimmed): t001 lands on st00; h001-h003 all drop you at h000.
const farm = [
  { name: 't001', intra_map: true, dest_portal: 'st00', x: 207, y: 1132 }, { name: 'st00', dest_map: '999999999', x: 190, y: 650 },
  { name: 'h000', dest_map: '999999999', x: 204, y: 1434 },
  { name: 'h001', intra_map: true, dest_portal: 'h000', x: 350, y: 832 }, { name: 'h002', intra_map: true, dest_portal: 'h000', x: 538, y: 592 }, { name: 'h003', intra_map: true, dest_portal: 'h000', x: 915, y: 830 },
  { name: 'out00', dest_map: '10001080', x: 3139, y: 479 }
];

test('pads that share a landing are traps; the rest teleport forward', () => {
  const pads = mapTeleports(farm);
  assert.deepEqual(pads[0], { x: 207, y: 1132, toX: 190, toY: 650, trap: false });
  assert.equal(pads.filter(pad => pad.trap).length, 3);
  assert.match(teleportHint(pads), /1 teleporter .* 3 traps/);
  assert.equal(teleportHint([]), '');
});

test('teleport pads survive saving the map data', () => {
  const data = validateDataset({ schemaVersion: 1, maps: [{ id: 'farm', name: "Utah's Pig Farm", teleports: mapTeleports(farm) }], portals: [], targets: [] });
  assert.equal(data.maps[0].teleports.length, 4);
});

test('ordinary teleporters (a town) need no hint', () => {
  assert.equal(teleportHint([{ x: 1, y: 1, toX: 2, toY: 2, trap: false }]), '');
});
