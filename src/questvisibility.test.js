import test from 'node:test';
import assert from 'node:assert/strict';
import { questVisible } from './questvisibility.js';

test('a manually finished quest stays out of GPS even if the Quest Helper still shows it', () => {
  assert.equal(questVisible('Donating to Kerning City', ['Donating to Kerning City'], ['Donating to Kerning City'], ['Donating to Kerning City']), false);
  assert.equal(questVisible('Donating to Kerning City', [], ['Donating to Kerning City']), true);
  assert.equal(questVisible('Luke the Security Guy', ['Luke the Security Guy']), false);
});
