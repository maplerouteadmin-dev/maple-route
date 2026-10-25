const test = require('node:test');
const assert = require('node:assert/strict');
const { VOICES, DEFAULT_VOICE, voiceUrl } = require('./piper.cjs');

test('Piper voices: only licences that allow this use, with download links in the voices repository', () => {
  assert.ok(VOICES[DEFAULT_VOICE]);
  for (const [name, voice] of Object.entries(VOICES)) {
    assert.match(voice.licence, /^(public domain|CC0|CC BY 4\.0|CC BY-SA 4\.0)$/, name);
    assert.doesNotMatch(voice.licence, /NC/, name);
  }
  assert.equal(voiceUrl('kristin'), 'https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/kristin/medium/en_US-kristin-medium.onnx');
  assert.equal(voiceUrl('alba'), 'https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_GB/alba/medium/en_GB-alba-medium.onnx');
});
