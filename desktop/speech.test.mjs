import test from 'node:test';
import assert from 'node:assert/strict';
import { speechCandidates } from './speech.mjs';

test('Linux speech uses bounded argument arrays, not shell commands', () => {
  const choices = speechCandidates('Go right; $(touch /tmp/never)', 2);
  assert.equal(choices[0].command, 'espeak-ng');
  assert.equal(choices[0].args.at(-1), 'Go right; $(touch /tmp/never)');
  assert.equal(choices[0].args[1], '300');
  assert.equal(choices[1].command, 'spd-say');
  assert.deepEqual(speechCandidates(''), []);
});
