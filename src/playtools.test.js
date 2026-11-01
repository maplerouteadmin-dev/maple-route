import test from 'node:test';
import assert from 'node:assert/strict';
import { bossRows, countdown, bossAnnouncements, respawnMinutes } from './bosstimers.js';
import { createSessionLog, logMap, logExp, logQuest, finishSession, summaryLines, betterMap } from './sessionlog.js';
import { lastReset, questsToReset } from './questresets.js';
import { mesoAmount, newChatLines, createMesoTracker, addMesos, mesosPerHour } from './mesotracker.js';
import { gameGone } from './disconnect.js';

const MIN = 60_000;

test('boss timers count down, soonest first, and announce a minute before and when due', () => {
  const now = 10 * 60 * MIN;
  const rows = bossRows({ Mano: { killedAt: now - 59 * MIN, minutes: 60 }, Stumpy: { killedAt: now - 70 * MIN }, Nobody: { killedAt: now } }, now);
  assert.deepEqual(rows.map(r => [r.name, r.due]), [['Stumpy', true], ['Mano', false]]);
  assert.equal(countdown(rows[1].left), '1:00');
  assert.equal(countdown(65 * MIN + 5000), '1:05:05');
  assert.equal(countdown(0), 'due');
  const said = bossAnnouncements(rows);
  assert.deepEqual(said.map(a => a.words), ['Stumpy should be back now.', 'Mano is due in a minute.']);
  assert.deepEqual(bossAnnouncements(rows, Object.fromEntries(said.map(a => [a.key, a.stage]))), []);
  assert.equal(respawnMinutes('abc'), 60); assert.equal(respawnMinutes(45), 45);
});

test('a session adds up time and EXP per map, levels and quests', () => {
  let log = createSessionLog(0, 20);
  log = logMap(log, 'a', 0);
  log = logExp(log, 3000);
  log = logMap(log, 'b', 30 * MIN);
  log = logExp(log, 2000, { levelUps: 1 });
  log = logQuest(log, ['Q1', 'Q1']);
  const summary = finishSession(log, 60 * MIN);
  assert.equal(summary.exp, 5000); assert.equal(summary.perHour, 5000); assert.equal(summary.levels, 1); assert.equal(summary.level, 21);
  assert.deepEqual(summary.maps.map(m => [m.mapId, m.minutes, m.perHour]), [['a', 30, 6000], ['b', 30, 4000]]);
  assert.deepEqual(summary.quests, ['Q1']);
  assert.equal(summaryLines(summary, id => id.toUpperCase())[0], '1 h 0 min played · 5,000 EXP (5,000/h) · +1 level');
});

test('suggests a clearly better map from past sessions near your level', () => {
  const history = [{ level: 21, maps: [{ mapId: 'good', minutes: 20, perHour: 9000 }, { mapId: 'meh', minutes: 20, perHour: 5000 }] }, { level: 40, maps: [{ mapId: 'far', minutes: 30, perHour: 50000 }] }];
  assert.deepEqual(betterMap({ mapId: 'here', perHour: 5000, minutes: 15, level: 22 }, history), { mapId: 'good', perHour: 9000, level: 21 });
  assert.equal(betterMap({ mapId: 'here', perHour: 7000, minutes: 15, level: 22 }, history), null);
  assert.equal(betterMap({ mapId: 'here', perHour: 1000, minutes: 5, level: 22 }, history), null);
});

test('daily quests reset at 00:00 UTC, weekly on Monday', () => {
  const wed = Date.UTC(2026, 10, 4, 15); // Wednesday 4 Nov 2026, 15:00 UTC
  assert.equal(lastReset('daily', wed), Date.UTC(2026, 10, 4));
  assert.equal(lastReset('weekly', wed), Date.UTC(2026, 10, 2));
  const catalog = [{ name: 'Daily', resets: 'daily' }, { name: 'Weekly', resets: 'weekly' }, { name: 'Once' }];
  const finishedAt = { Daily: Date.UTC(2026, 10, 3, 22), Weekly: Date.UTC(2026, 10, 3), Once: 0 };
  assert.deepEqual(questsToReset(catalog, ['Daily', 'Weekly', 'Once'], finishedAt, wed), ['Daily']);
  assert.deepEqual(questsToReset(catalog, ['Weekly'], { Weekly: Date.UTC(2026, 9, 31) }, wed), ['Weekly']);
});

test('meso pickups are read from new chat lines only', () => {
  assert.equal(mesoAmount('You have gained mesos (+1,250)'), 1250);
  assert.equal(mesoAmount('You picked up 37 mesos'), 37);
  assert.equal(mesoAmount('Hero: selling for 5,000,000 mesos'), 0);
  assert.deepEqual(newChatLines([], ['a', 'b']).fresh, []);
  assert.deepEqual(newChatLines(['a', 'b', 'c'], ['b', 'c', 'd', 'e']).fresh, ['d', 'e']);
  assert.deepEqual(newChatLines(['a', 'b'], ['a', 'b']).fresh, []);
  let t = createMesoTracker(0);
  t = addMesos(t, [100, 0, 50], 60_000);
  assert.equal(mesosPerHour(t, 60_000), null); // under 2 minutes
  assert.equal(mesosPerHour(t, 30 * MIN), 300);
});

test('the game counts as gone after 90 seconds without mini map and status bars', () => {
  assert.equal(gameGone({ minimapSeenAt: 0, barsSeenAt: 10_000, startedAt: 1, now: 95_000 }), false);
  assert.equal(gameGone({ minimapSeenAt: 0, barsSeenAt: 10_000, startedAt: 1, now: 101_000 }), true);
  assert.equal(gameGone({ now: 500_000 }), false);
});
