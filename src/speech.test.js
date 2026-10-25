import test from 'node:test';
import assert from 'node:assert/strict';
import { spoken } from './speech.js';

test('Roman numerals in map names are said as numbers', () => {
  assert.equal(spoken('Head to Ant Tunnel I.'), 'Head to Ant Tunnel 1.');
  assert.equal(spoken('Take the portal to West Rocky Mountain II then The Forest III'), 'Take the portal to West Rocky Mountain 2 then The Forest 3');
  assert.equal(spoken('Hunt on Dangerous Croko I, then Line 1 <Area 1>'), 'Hunt on Dangerous Croko 1, then Line 1 <Area 1>');
  assert.equal(spoken('Then I go home'), 'Then I go home');
  assert.equal(spoken('You are here. I think'), 'You are here. I think');
  assert.equal(spoken("Luke's IV"), "Luke's 4");
  assert.equal(spoken('Go to Remains <Tomb> II.'), 'Go to Remains <Tomb> 2.');
});
