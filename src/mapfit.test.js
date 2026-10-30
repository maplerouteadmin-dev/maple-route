import test from 'node:test';
import assert from 'node:assert/strict';
import { fittedMapSize } from './mapfit.js';

test('small maps grow to fit the viewport without distortion', () => {
  assert.deepEqual(fittedMapSize(100, 80, 824, 344), { width: 430, height: 344, top: 0 });
});

test('wide maps fill available width and stay vertically centered', () => {
  assert.deepEqual(fittedMapSize(300, 60, 824, 344), { width: 824, height: 165, top: 89 });
});

test('maps larger than the viewport keep their scrollable size', () => {
  assert.deepEqual(fittedMapSize(1200, 400, 824, 344), { width: 1200, height: 400, top: 0 });
});

test('unmeasured viewports are ignored', () => {
  assert.equal(fittedMapSize(100, 80, 0, 344), null);
});
