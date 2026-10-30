import test from 'node:test';
import assert from 'node:assert/strict';
import { makeProfileBackup, parseProfileBackup, snapshotProfile } from './profile.js';

const state = {
  current: '100000000', destination: '101000000', routeStyle: 'fewest',
  targetId: null, crop: null, goals: [{ id: 'one', title: 'Visit Henesys', mapId: '100000000' }],
  level: 15, journeyLevelConfirmed: 14, job: 'Thief', focus: 'quests', guideMode: 'xp',
  selectedItem: { name: 'Blue Snail Shell' }, selectedQuest: { name: 'A Quest' },
  gearOwned: {}, partyDone: [], sessions: [], questDone: {}, activeQuests: [], questItemsReady: {},
  data: { maps: ['not part of backup'] }
};

test('progress backups preserve personal settings but not map-cache data', () => {
  const backup = makeProfileBackup(state);
  assert.equal(backup.format, 'maple-route-profile');
  assert.equal(backup.profile.selectedItemName, 'Blue Snail Shell');
  assert.equal(backup.profile.selectedQuest, 'A Quest');
  assert.equal(backup.profile.journeyLevelConfirmed, 14);
  assert.equal(Object.hasOwn(backup.profile, 'data'), false);
  assert.deepEqual(parseProfileBackup(JSON.stringify(backup)), snapshotProfile(state));
});

test('restore rejects unrelated or malformed JSON', () => {
  assert.throws(() => parseProfileBackup('{}'), /not a supported/);
  assert.throws(() => parseProfileBackup('not json'), SyntaxError);
  const backup = makeProfileBackup(state);
  backup.profile.level = -1;
  assert.throws(() => parseProfileBackup(JSON.stringify(backup)), /invalid character level/);
  backup.profile.level = 15;
  backup.profile.journeyLevelConfirmed = 20;
  assert.throws(() => parseProfileBackup(JSON.stringify(backup)), /invalid confirmed level/);
});
