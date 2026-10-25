const test = require('node:test');
const assert = require('node:assert/strict');
const { overlayBounds, pairingBounds, overlayPosition } = require('./deck-overlay.cjs');

test('Deck overlay placements avoid the in-game mini map, the chat and the level bar', () => {
  const clear = (b, box) => b.x + b.width <= box.x || box.x + box.w <= b.x || b.y + b.height <= box.y || box.y + box.h <= b.y;
  const minimap = { x: 0, y: 40, w: 170, h: 185 }, chat = { x: 268, y: 633, w: 522, h: 64 }, bar = { x: 265, y: 697, w: 750, h: 63 };
  for (const corner of ['bottom-left', 'bottom-right', 'upper-right']) for (const b of [overlayBounds(corner), pairingBounds(corner)]) {
    assert.ok(b.x >= 0 && b.x + b.width <= 1280 && b.y >= 40 && b.y + b.height <= 760, corner);
    for (const box of [minimap, chat, bar]) assert.ok(clear(b, box), `${corner} overlaps the HUD`);
  }
  assert.equal(overlayPosition('nonsense'), 'bottom-left');
});
