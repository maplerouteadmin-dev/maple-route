import test from 'node:test';
import assert from 'node:assert/strict';
import { wikiPortalEdges } from './osms.js';

test('wiki portals fill links the game-file feed lacks, only when the map names are unambiguous', () => {
  const maps = [{ id: 'el', name: 'Ellinia' }, { id: 'st', name: 'Ellinia Station' }, { id: 'm1', name: 'Mushroom Town' }, { id: 'm2', name: 'Mushroom Town' }, { id: 'b1', name: 'B1 <Area 1>' }, { id: 'b2', name: 'B1 <Area 2>' }];
  const existing = [{ from: 'b1', to: 'b2' }];
  const rows = [
    { page: 'Ellinia', to: 'Ellinia Station', type: 'walking' },
    { page: 'B1 (Area 1)', to: 'B1 (Area 2)', type: 'walking' }, // already known (brackets differ on the wiki)
    { page: 'Ellinia Station', to: 'Mushroom Town', type: 'walking' }, // two maps share that name: skipped
    { page: 'Southperry', to: 'Lith Harbor', type: 'transport' }, // boats are handled elsewhere
    { page: 'B1 (Area 2)', to: 'Ellinia', type: 'hidden', requiresItem: 'Subway Ticket' }
  ];
  const added = wikiPortalEdges(maps, existing, rows);
  assert.deepEqual(added.map(p => [p.from, p.to, p.kind]), [['el', 'st', 'walk'], ['b2', 'el', 'hidden']]);
  assert.match(added[1].note, /Needs Subway Ticket/);
  assert.ok(added[1].cost > added[0].cost);
});
