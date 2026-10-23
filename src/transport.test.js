import test from 'node:test';
import assert from 'node:assert/strict';

test('boats get you off Maple Island and to Florina Beach, even with taxis off', async () => {
  const { transportEdges } = await import('./transport.js');
  const maps = [{ id: 's', name: 'Southperry', area: 'Maple Island' }, { id: 'l', name: 'Lith Harbor', area: 'Victoria Island' }, { id: 'f', name: 'Florina Beach', area: 'Victoria Island' }];
  const edges = transportEdges(maps, () => null);
  assert.ok(edges.some(e => e.from === 's' && e.to === 'l' && e.npc === 'Shanks' && e.boat && e.fare[0] === 300));
  assert.ok(edges.some(e => e.from === 'l' && e.to === 'f' && e.npc === 'Pason'));
  assert.ok(edges.some(e => e.from === 'f' && e.to === 'l' && e.npc === 'Pison'));
});
