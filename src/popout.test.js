import test from 'node:test';
import assert from 'node:assert/strict';
import { popoutMetrics, popupExp, expSpeech, EXP_SPEECH_EVERY_MS, clock } from './popout.js';

test('pop-out displays the same route count and measured EXP as Live GPS', () => {
  assert.equal(popoutMetrics({ remaining: 3, reading: true, tracker: { last: {}, minutes: 4, perHour: 1234 } }), '3 portals to destination · 1,234 EXP/h');
  assert.equal(popoutMetrics({ remaining: 1 }), '1 portal to destination');
});

test('pop-out does not show a false portal or stale EXP rate', () => {
  assert.equal(popoutMetrics({ remaining: null, reading: false, tracker: { last: {}, minutes: 4, perHour: 500 } }), '');
  assert.equal(popoutMetrics({ remaining: 0, reading: true, tracker: { last: {}, minutes: 1, perHour: 500 } }), 'Measuring EXP/h…');
  assert.equal(popoutMetrics({ remaining: 2, reading: true, tracker: { last: {}, minutes: 4, perHour: 500 }, fresh: false }), '2 portals to destination · EXP/h unavailable');
  assert.equal(popoutMetrics({ reading: true }), 'Waiting for EXP…');
});

test('Deck pop-up EXP shows the rate, percent and time to level, never a stale rate', () => {
  const summary = { minutes: 10, perHour: 12345.6, percent: 42.126, percentPerHour: 6, minutesToLevel: 578 };
  assert.deepEqual(popupExp({ summary, reading: true }), { rate: '12,346 EXP/h', detail: 'EXP 42.13% · 6.0%/h · level in 10 h' });
  assert.deepEqual(popupExp({ summary: { ...summary, minutesToLevel: 40 }, reading: true }).detail, 'EXP 42.13% · 6.0%/h · level in 40 min');
  assert.equal(popupExp({ summary: { ...summary, minutes: 1 }, reading: true }).rate, '~12,346 EXP/h');
  assert.equal(popupExp({ summary: { ...summary, minutes: .2 }, reading: true }).rate, 'Measuring EXP/h…');
  assert.equal(popupExp({ summary, reading: true, fresh: false }).rate, 'EXP/h unavailable');
  assert.deepEqual(popupExp({ summary, reading: false }), { rate: '', detail: '' });
  assert.equal(popupExp({ reading: true }).rate, 'Waiting for EXP…');
});

test('EXP/hour is spoken rounded, only once the rate has settled', () => {
  assert.equal(expSpeech({ minutes: 5, perHour: 12345, minutesToLevel: 40 }), '12,000 EXP an hour. Level up in about 40 minutes.');
  assert.equal(expSpeech({ minutes: 5, perHour: 4567, minutesToLevel: 300 }), '4,600 EXP an hour. Level up in about 5 hours.');
  assert.equal(expSpeech({ minutes: 5, perHour: 456, minutesToLevel: null }), '456 EXP an hour.');
  assert.equal(expSpeech({ minutes: 1, perHour: 12345 }), '');
  assert.equal(expSpeech({ minutes: 5, perHour: 0 }), '');
  assert.ok(EXP_SPEECH_EVERY_MS >= 120_000 && EXP_SPEECH_EVERY_MS <= 180_000);
});

test('EXP/h waits until you have been on one map for 3 minutes', () => {
  assert.equal(clock(125_000), '2:05'); assert.equal(clock(400), '0:01'); assert.equal(clock(0), '0:00');
  assert.deepEqual(popupExp({ reading: true, waitMs: 90_000 }), { rate: '', detail: '' });
  assert.equal(popoutMetrics({ remaining: 2, reading: true, waitMs: 61_000 }), '2 portals to destination');
  assert.deepEqual(popupExp({ reading: false, waitMs: 90_000 }), { rate: '', detail: '' });
});
