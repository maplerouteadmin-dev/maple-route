import test from 'node:test';
import assert from 'node:assert/strict';
import { deckDirectionSummary } from './decksummary.js';

test('the Deck summary says arrived when the route ends at its destination', () => {
  assert.equal(deckDirectionSummary({ current: 'road', destination: 'road' }), 'You have arrived.');
});

test('uncertain maps do not claim arrival, and live directions take precedence', () => {
  assert.equal(deckDirectionSummary({ current: 'road', destination: 'road', uncertain: true }), 'Waiting for a route');
  assert.equal(deckDirectionSummary({ current: 'road', destination: 'road', headline: 'Talk to Jane' }), 'Talk to Jane');
});
