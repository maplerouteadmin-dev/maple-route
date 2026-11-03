import test from 'node:test';
import assert from 'node:assert/strict';
import { npcLocations, npcMapId, questNpcDestination } from './npclocations.js';
import { questObjective } from './objective.js';
import { questStepMaps } from './quests.js';

const data = {
  maps: [
    { id: 'kerning', name: 'Kerning City' },
    { id: 'henesys', name: 'Henesys' },
    { id: 'party', name: 'Party Quest Stage' }
  ],
  portals: [
    { from: 'kerning', to: 'henesys', name: 'east', cost: 1 },
    { from: 'henesys', to: 'kerning', name: 'west', cost: 1 }
  ],
  targets: [
    { id: 'pq-nella', name: 'Nella', kind: 'npc', locations: [{ mapId: 'party' }] },
    { id: 'city-nella', name: 'Nella', kind: 'npc', locations: [{ mapId: 'kerning' }] },
    { id: 'board', name: 'Community Board', kind: 'npc', locations: [{ mapId: 'henesys' }, { mapId: 'kerning' }] }
  ]
};

test('Citizenship routes to reachable Nella, not the first party-quest Nella', () => {
  assert.deepEqual(npcLocations(data, 'Nella', 'henesys').map(x => [x.mapId, x.hops]), [['kerning', 1], ['party', null]]);
  assert.equal(npcMapId(data, 'Nella', 'henesys'), 'kerning');
  assert.equal(questObjective(data, { quest: 'First Greeting with Nella', currentMapId: 'henesys', catalogQuest: { turnIn: 'Nella', needs: [] } }).mapId, 'kerning');
  assert.deepEqual(questStepMaps(data, { npc: 'Nella', map: 'Kerning City' }, 'henesys').map(x => x.map.id), ['kerning']);
});

test('a quest map disambiguates NPCs in several reachable towns', () => {
  assert.equal(npcMapId(data, 'Community Board', 'kerning', { mapName: 'Henesys' }), 'henesys');
  assert.equal(npcMapId(data, 'Community Board', 'kerning'), 'kerning');
  assert.equal(npcMapId(data, 'Community Board', 'henesys', { nearMapId: 'kerning' }), 'kerning');
  assert.equal(npcMapId(data, 'Community Board'), null);
  assert.equal(npcMapId(data, 'Community Board', null, { mapName: 'Unknown town' }), null);
  assert.equal(questNpcDestination(data, 'Community Board', 'kerning', { steps: [{ npc: 'Community Board (Kerning City)', map: 'Henesys' }] }), 'henesys');
  assert.equal(questNpcDestination(data, 'Community Board', 'kerning', { steps: [{ npc: 'Community Board', map: 'Henesys' }], chosen: 'kerning' }), 'kerning');
});

test('unreachable NPC locations never become GPS destinations', () => {
  assert.equal(npcMapId(data, 'Nella', 'party', { mapName: 'Kerning City' }), null);
  assert.equal(npcMapId(data, 'Missing NPC', 'kerning'), null);
});

test('a job instructor the data only puts on the hidden test map also stands on its return map', async () => {
  const { placeHiddenNpcs, npcMapId } = await import('./npclocations.js');
  const { validateDataset } = await import('./core.js');
  const data = validateDataset({ schemaVersion: 1, maps: [{ id: 'perion', name: 'Perion' }, { id: 'rocky4', name: 'West Rocky Mountain IV' }, { id: 'test', name: "Warrior's Rocky Mountain", returnTo: 'rocky4' }],
    portals: [{ from: 'perion', to: 'rocky4', name: 'w' }, { from: 'rocky4', to: 'perion', name: 'e' }],
    targets: [{ id: 'wji', kind: 'npc', name: 'Warrior Job Instructor', locations: [{ mapId: 'test' }] }] });
  assert.equal(npcMapId(data, 'Warrior Job Instructor', 'perion'), null);
  assert.deepEqual(placeHiddenNpcs(data), ['Warrior Job Instructor']);
  assert.equal(npcMapId(data, 'Warrior Job Instructor', 'perion'), 'rocky4');
});
