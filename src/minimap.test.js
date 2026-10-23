import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { findTitleBand, findTitleBar, titleTextRect, findMarkers, fitMinimap, toWorld, guidance, inkTitle, minimapLayout, recallScale, rememberScale } from './minimap.js';

// Henesys visible portals (OSMS coordinates) used to check the screenshot fixtures.
const HENESYS = [
  { name: 'west00', x: 246, y: 870 }, { name: 'in04', x: 2962, y: 925 }, { name: 'in00', x: 3706, y: 930 },
  { name: 'in01', x: 4528, y: 719 }, { name: 'in05', x: 4599, y: 1048 }, { name: 'in02', x: 5816, y: 1048 },
  { name: 'east00', x: 6587, y: 1050 }, { name: 'east10', x: 6753, y: 419 }
];

function fixture(name) {
  const base = new URL(`../fixtures/screens/${name}`, import.meta.url);
  const meta = new URL(`${base.href}.json`), raw = new URL(`${base.href}.rgba`);
  if (!existsSync(meta) || !existsSync(raw)) return null;
  const { width, height } = JSON.parse(readFileSync(meta, 'utf8'));
  return { width, height, data: new Uint8ClampedArray(readFileSync(raw)) };
}

// Draws a mini map window like the game's: pale-blue title strip, light frame, dark picture with a
// gold player dot and teal portal rings placed at scale * world + offset.
function drawMinimap({ width = 1200, height = 700, x = 0, y = 20, unit = 50, pictureW = 300, pictureH = 110, scale = .07, offsetX = -60, offsetY = 20, player = { x: 3400, y: 940 }, collapsed = false }) {
  const data = new Uint8ClampedArray(width * height * 4);
  const fill = (rx, ry, rw, rh, [r, g, b]) => {
    for (let yy = Math.max(0, Math.round(ry)); yy < Math.min(height, Math.round(ry + rh)); yy++)
      for (let xx = Math.max(0, Math.round(rx)); xx < Math.min(width, Math.round(rx + rw)); xx++) data.set([r, g, b, 255], (yy * width + xx) * 4);
  };
  fill(0, 0, width, height, [70, 120, 200]); // sky
  const frame = Math.max(2, Math.round(unit * .06)), windowW = pictureW + frame * 2;
  fill(x, y, unit, unit, [60, 50, 90]); // region emblem
  fill(x + unit, y, windowW - unit, unit, [155, 188, 206]);
  if (!collapsed) {
    const top = y + unit;
    fill(x, top, windowW, frame, [238, 238, 238]);
    fill(x, top + frame, frame, pictureH, [238, 238, 238]);
    fill(x + windowW - frame, top + frame, frame, pictureH, [238, 238, 238]);
    fill(x, top + frame + pictureH, windowW, frame * 2, [238, 238, 238]);
    const px = x + frame, py = top + frame;
    fill(px, py, pictureW, pictureH, [30, 45, 40]);
    const dot = Math.round(unit * .13), ring = Math.round(unit * .17);
    for (const portal of HENESYS) {
      const cx = px + scale * portal.x + offsetX, cy = py + scale * portal.y + offsetY;
      if (cx > px + ring && cx < px + pictureW - ring && cy > py + ring && cy < py + pictureH - ring) fill(cx - ring / 2, cy - ring / 2, ring, ring, [40, 110, 140]);
    }
    fill(px + scale * player.x + offsetX - dot / 2, py + scale * player.y + offsetY - dot / 2, dot, dot, [240, 218, 69]);
  }
  return { width, height, data };
}

function locate(image, hint = null) {
  const band = findTitleBand(image);
  const markers = findMarkers(image, band);
  const fit = markers.player ? fitMinimap(markers.portals, HENESYS, band.h, hint) : null;
  return { band, markers, fit, player: fit && toWorld(fit, markers.player) };
}

test('finds the title text next to the emblem', () => {
  const band = findTitleBand(drawMinimap({}));
  assert.equal(band.y, 20); assert.equal(band.h, 50);
  assert.equal(titleTextRect(band).x, 50);
});

for (const [label, options] of [
  ['default size', {}],
  ['expanded window', { pictureW: 520, pictureH: 260, offsetX: -150, offsetY: 60 }],
  ['small window', { pictureW: 190, pictureH: 70, offsetX: -150, offsetY: -25 }],
  ['zoomed-in picture', { scale: .11, pictureW: 420, pictureH: 160, offsetX: -260, offsetY: 0 }],
  ['larger game resolution', { width: 2400, height: 1400, unit: 80, scale: .112, pictureW: 480, pictureH: 176, offsetX: -100, offsetY: 32 }]
]) {
  test(`mini map ${label}: frame, markers and position`, () => {
    const { markers, fit, player } = locate(drawMinimap(options));
    assert.ok(markers.body, 'picture frame found');
    assert.ok(markers.player, 'player dot');
    assert.ok(fit && fit.inliers >= 2, `fit ${JSON.stringify(fit)}`);
    assert.ok(Math.abs(player.x - 3400) < 40 && Math.abs(player.y - 940) < 40, `player ${JSON.stringify(player)}`);
  });
}

test('a collapsed mini map still has a title but no picture or position', () => {
  const image = drawMinimap({ collapsed: true });
  const band = findTitleBand(image);
  assert.ok(band);
  const markers = findMarkers(image, band);
  assert.equal(markers.collapsed, true); assert.equal(markers.player, null);
});

test('scales are remembered per mini map layout', () => {
  const small = { w: 4, h: 1.5 }, big = { w: 9, h: 5 };
  let memory = rememberScale([], small, .0014);
  memory = rememberScale(memory, big, .0021);
  assert.equal(recallScale(memory, { w: 4.1, h: 1.52 }), .0014);
  assert.equal(recallScale(memory, big), .0021);
  assert.equal(recallScale(memory, { w: 6, h: 3 }), null);
  assert.deepEqual(minimapLayout({ h: 50 }, { w: 300, h: 100 }), { w: 6, h: 2 });
});

test('fits ring positions to world portals and recovers the player position', () => {
  const world = [{ x: 1000, y: 500 }, { x: 2000, y: 300 }, { x: 4000, y: 500 }];
  const s = .1, ox = -50, oy = 40;
  const rings = world.slice(0, 2).map(p => ({ x: s * p.x + ox, y: s * p.y + oy }));
  const fit = fitMinimap(rings, world, 60);
  assert.equal(fit.inliers, 2);
  assert.ok(Math.abs(fit.scale - s) < 1e-9);
  const player = toWorld(fit, { x: s * 1500 + ox, y: s * 450 + oy });
  assert.ok(Math.abs(player.x - 1500) < 1e-6 && Math.abs(player.y - 450) < 1e-6);
  // With a remembered scale, a single ring is enough.
  const single = fitMinimap(rings.slice(0, 1), world, 60, { scale: s / 60 });
  assert.ok(single && Math.abs(single.ox - ox) < 1e-6);
  assert.equal(fitMinimap(rings.slice(0, 1), world, 60), null);
});

test('guidance gives plain directions', () => {
  assert.equal(guidance({ x: 100, y: 500 }, { x: 2600, y: 500 }).text, 'Head right, about 3 screens');
  assert.equal(guidance({ x: 3000, y: 900 }, { x: 2700, y: 600 }).text, 'Head left, a few steps, then climb up');
  assert.equal(guidance({ x: 3700, y: 930 }, { x: 3706, y: 930 }).near, true);
  assert.equal(guidance({ x: 0, y: 0 }, { x: 1150, y: 0 }).text, 'Head right, about 2 screens');
});

test('inkTitle turns white text black and everything else white', () => {
  const image = { width: 2, height: 1, data: new Uint8ClampedArray([155, 188, 206, 255, 250, 250, 250, 255]) };
  inkTitle(image);
  assert.deepEqual([...image.data], [255, 255, 255, 255, 0, 0, 0, 255]);
});

for (const [name, expectedX] of [['henesys-1', 3410], ['henesys-2', 3690], ['henesys-1-1366', 3410], ['henesys-2-1366', 3690]]) {
  test(`real screenshot ${name}: locates the player in Henesys`, { skip: !fixture(name) && 'fixture not present' }, () => {
    const image = fixture(name);
    const { band, markers, fit, player } = locate(image);
    assert.ok(band && band.textX > band.x, JSON.stringify(band));
    assert.ok(markers.body, 'picture frame');
    assert.ok(markers.player, 'player dot');
    assert.ok(markers.portals.length >= 3, `rings: ${markers.portals.length}`);
    assert.ok(fit && fit.inliers >= 3, JSON.stringify(fit));
    assert.ok(Math.abs(player.x - expectedX) < 60, `player x ${player.x}`);
  });
}

const collapsedShot = fixture('collapsed-1');
test('real screenshot: a map without a mini map shows only its title bar', { skip: !collapsedShot && 'fixture not present' }, () => {
  assert.equal(findTitleBand(collapsedShot), null);
  const bar = findTitleBar(collapsedShot);
  assert.ok(bar && bar.collapsed && bar.x < 6 && bar.y < 6, JSON.stringify(bar));
  const text = titleTextRect(bar);
  assert.ok(text.w > 180 && text.w < 230, JSON.stringify(text));
  assert.equal(findMarkers(collapsedShot, bar).collapsed, true);
});
