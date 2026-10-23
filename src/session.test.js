import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeSession, bestMeasuredSpot } from './session.js';
import { PARTY_QUEST, partyLevelMessage } from './party.js';

test('session totals and hourly rates use actual elapsed minutes', () => {
  const row = summarizeSession({ startLevel: 21, endLevel: 21, startExp: 100, endExp: 400, startMesos: 5000, endMesos: 4500, minutes: 30, mapId: 'a' });
  assert.equal(row.expGained, 300);
  assert.equal(row.expPerHour, 600);
  assert.equal(row.mesosPerHour, -1000);
});

test('level-up requires manually entered total EXP gained', () => {
  const input = { startLevel: 21, endLevel: 22, startExp: 900, endExp: 20, startMesos: 0, endMesos: 100, minutes: 10 };
  assert.throws(() => summarizeSession(input), /total EXP gained/);
  assert.equal(summarizeSession({ ...input, expGained: 120 }).expPerHour, 720);
});

test('measured recommendations use nearby levels and PQ shows the listed range', () => {
  const rows = [{ startLevel: 20, expPerHour: 100 }, { startLevel: 40, expPerHour: 999 }];
  assert.equal(bestMeasuredSpot(rows, 22).expPerHour, 100);
  assert.equal(PARTY_QUEST.stages.length, 6);
  assert.match(partyLevelMessage(15), /below/);
});
