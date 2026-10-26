import test from 'node:test';
import assert from 'node:assert/strict';
import { usesLocalVoice } from './voiceplatform.js';

test('Linux uses its local natural voice even if Chromium reports browser voices', () => {
  assert.equal(usesLocalVoice('linux'), true);
  assert.equal(usesLocalVoice('win32'), false);
  assert.equal(usesLocalVoice(undefined), false);
});
