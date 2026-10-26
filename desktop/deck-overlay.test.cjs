const test = require('node:test');
const assert = require('node:assert/strict');
const { overlayBounds, pairingBounds, overlayPosition, displaySizeFromHelper } = require('./deck-overlay.cjs');

test('Deck overlay placements avoid the in-game mini map, the chat and the level bar', () => {
  const clear = (b, box) => b.x + b.width <= box.x || box.x + box.w <= b.x || b.y + b.height <= box.y || box.y + box.h <= b.y;
  const minimap = { x: 0, y: 40, w: 170, h: 185 }, chat = { x: 268, y: 633, w: 522, h: 64 }, bar = { x: 265, y: 697, w: 750, h: 63 };
  for (const corner of ['bottom-left', 'bottom-right', 'upper-right']) for (const b of [overlayBounds(corner), pairingBounds(corner)]) {
    assert.ok(b.x >= 0 && b.x + b.width <= 1280 && b.y >= 40 && b.y + b.height <= 800, corner);
    for (const box of [minimap, chat, bar]) assert.ok(clear(b, box), `${corner} overlaps the HUD`);
  }
  assert.equal(overlayPosition('nonsense'), 'bottom-left');
});

test('the bottom corners reach the bottom edge of the screen', () => {
  for (const corner of ['bottom-left', 'bottom-right']) { const b = overlayBounds(corner); assert.equal(b.y + b.height, 800, corner); }
});

test('the map grows into the bottom-left gap without covering chat on Deck and docked displays', () => {
  for (const viewport of [{ width: 1280, height: 800 }, { width: 1920, height: 1080 }, { width: 3840, height: 2160 }]) {
    const sx = viewport.width / 1280, sy = viewport.height / 800;
    for (const b of [overlayBounds('bottom-left', viewport), pairingBounds('bottom-left', viewport)]) {
      assert.equal(b.y + b.height, viewport.height);
      assert.ok(b.x + b.width < 265 * sx, 'stays left of chat and level UI');
      assert.ok(b.y > 225 * sy, 'stays below the in-game mini map');
    }
    assert.equal(overlayBounds('bottom-left', viewport).height, Math.round(208 * sy));
  }
});

test('the transparent overlay reports a valid TV display size', () => {
  assert.deepEqual(displaySizeFromHelper('{"screen":{"width":1920,"height":1080}}'), { width: 1920, height: 1080 });
  assert.equal(displaySizeFromHelper('{"screen":{"width":1280}}'), null);
  assert.equal(displaySizeFromHelper('{"screen":{"width":9000,"height":1080}}'), null);
  assert.equal(displaySizeFromHelper('not json'), null);
});
