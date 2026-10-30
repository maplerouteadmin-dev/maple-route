import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveMapHandoff } from './maphandoff.js';

test('a changed but unreadable title pauses old-map directions and forces another read', () => {
  assert.deepEqual(resolveMapHandoff({ current: 'old', titleChanged: true }),
    { mapId: 'old', pending: null, settling: true, rememberTitle: false });
});

test('a neighboring map switches immediately; a distant map needs two matching reads', () => {
  const first = resolveMapHandoff({ current: 'old', recognized: 'new', neighbor: true });
  assert.deepEqual(first, { mapId: 'new', pending: null, settling: false, rememberTitle: true });
  const distant = resolveMapHandoff({ current: 'old', recognized: 'far' });
  assert.deepEqual(distant, { mapId: 'old', pending: 'far', settling: true, rememberTitle: false });
  assert.equal(resolveMapHandoff({ current: 'old', pending: distant.pending, recognized: 'far' }).mapId, 'far');
});

test('a strong picture match resolves an uncertain title, while an unchanged failed safety read does not unsettle GPS', () => {
  assert.equal(resolveMapHandoff({ current: 'old', titleChanged: true, picture: 'new' }).mapId, 'new');
  assert.deepEqual(resolveMapHandoff({ current: 'old', titleChanged: false }),
    { mapId: 'old', pending: null, settling: false, rememberTitle: true });
});

test('a changed title does not let stale old-map OCR or picture matching resume directions', () => {
  const first = resolveMapHandoff({ current: 'old', recognized: 'old', titleChanged: true });
  assert.deepEqual(first, { mapId: 'old', pending: 'old', settling: true, rememberTitle: false });
  assert.deepEqual(resolveMapHandoff({ current: 'old', picture: 'old', titleChanged: true }),
    { mapId: 'old', pending: null, settling: true, rememberTitle: false });
  assert.deepEqual(resolveMapHandoff({ current: 'old', pending: 'old', recognized: 'old', titleChanged: true }),
    { mapId: 'old', pending: 'old', settling: true, rememberTitle: false });
  assert.deepEqual(resolveMapHandoff({ current: 'old', pending: 'old', recognized: 'old', titleChanged: false }),
    { mapId: 'old', pending: null, settling: false, rememberTitle: true });
  assert.equal(resolveMapHandoff({ current: 'old', recognized: 'old', picture: 'new', titleChanged: true }).mapId, 'new');
});

test('same OCR title and same map art settle crop jitter without a checking flash', () => {
  assert.deepEqual(resolveMapHandoff({ current: 'hill', recognized: 'hill', picture: 'hill', titleChanged: true }),
    { mapId: 'hill', pending: null, settling: false, rememberTitle: true });
});
