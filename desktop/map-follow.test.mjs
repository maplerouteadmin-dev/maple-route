import test from 'node:test';
import assert from 'node:assert/strict';
import { centeredScroll } from './map-follow.mjs';

test('phone map centers its own viewport on the character', () => {
  assert.deepEqual(centeredScroll({ x: 600, y: 300, svgWidth: 1200, svgHeight: 600, viewBoxWidth: 1200, viewBoxHeight: 600, viewportWidth: 300, viewportHeight: 200 }), { left: 450, top: 200 });
  assert.deepEqual(centeredScroll({ x: 20, y: 20, svgWidth: 1200, svgHeight: 600, viewBoxWidth: 1200, viewBoxHeight: 600, viewportWidth: 300, viewportHeight: 200 }), { left: 0, top: 0 });
  assert.equal(centeredScroll({ x: 20, y: 20, svgWidth: 0, svgHeight: 600, viewBoxWidth: 1200, viewBoxHeight: 600, viewportWidth: 300, viewportHeight: 200 }), null);
});
