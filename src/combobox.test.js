import test from 'node:test';
import assert from 'node:assert/strict';
import { filterOptions } from './combobox.js';

const maps = ['Lith Harbor · Victoria Island', 'Henesys Hunting Ground I', 'Henesys', 'Path to Henesys', 'Ellinia'].map((label, i) => ({ value: String(i), label }));
const labels = list => list.map(option => option.label);

test('empty query returns the full list in order', () => {
  assert.deepEqual(labels(filterOptions(maps, '  ')), labels(maps));
});

test('filters by substring, case-insensitive, and ranks prefix then word-start matches', () => {
  assert.deepEqual(labels(filterOptions(maps, 'hene')), ['Henesys Hunting Ground I', 'Henesys', 'Path to Henesys']);
  assert.deepEqual(labels(filterOptions(maps, 'ESYS')), ['Henesys Hunting Ground I', 'Henesys', 'Path to Henesys']);
});

test('every typed word must match, in any order', () => {
  assert.deepEqual(labels(filterOptions(maps, 'hunting hen')), ['Henesys Hunting Ground I']);
  assert.deepEqual(labels(filterOptions(maps, 'victoria')), ['Lith Harbor · Victoria Island']);
  assert.deepEqual(filterOptions(maps, 'kerning'), []);
});
