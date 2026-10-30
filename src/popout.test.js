import test from 'node:test';
import assert from 'node:assert/strict';
import { popoutMetrics } from './popout.js';

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
