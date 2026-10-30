import test from 'node:test';
import assert from 'node:assert/strict';
import { auditQuestRoutes } from './questrouteaudit.js';

test('route audit separates missing NPCs from mapped but isolated ones', () => {
  const data = { maps: [{ id: 'town', name: 'Henesys' }, { id: 'field', name: 'Field' }, { id: 'room', name: 'Event Room' }],
    portals: [{ from: 'town', to: 'field' }], targets: [
      { kind: 'npc', name: 'Admin', locations: [{ mapId: 'room' }, { mapId: 'field' }] },
      { kind: 'npc', name: 'Isolated', locations: [{ mapId: 'room' }] }
    ] };
  const out = auditQuestRoutes(data, [
    { name: 'Good', giver: 'Admin' }, { name: 'No map', turnIn: 'Missing' }, { name: 'No path', turnIn: 'Isolated' }
  ]);
  assert.equal(out.reachable, 2);
  assert.deepEqual(out.issues.map(issue => [issue.npc, issue.status]), [['Missing', 'unmapped'], ['Isolated', 'isolated']]);
});
