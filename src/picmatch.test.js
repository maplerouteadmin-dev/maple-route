import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { locateInPicture, findPictureScale } from './picmatch.js';
import { findTitleBand, findMarkers } from './minimap.js';

// Synthetic picture: random opaque blocks; the "screen" is a 2x upscaled window of it.
function makePicture(w, h, seed = 7) {
  const data = new Uint8ClampedArray(w * h * 4); let s = seed;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 160; i++) {
    const bx = Math.floor(rnd() * w), by = Math.floor(rnd() * h), bw = 4 + Math.floor(rnd() * 20), bh = 3 + Math.floor(rnd() * 10), c = [rnd() * 255, rnd() * 255, rnd() * 255];
    for (let y = by; y < Math.min(h, by + bh); y++) for (let x = bx; x < Math.min(w, bx + bw); x++) data.set([...c, 255], (y * w + x) * 4);
  }
  return { width: w, height: h, data };
}
function viewOf(pic, x0, y0, w, h, k) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const px = Math.floor(x0 + x / k), py = Math.floor(y0 + y / k), i = (py * pic.width + px) * 4;
    const a = px >= 0 && py >= 0 && px < pic.width && py < pic.height ? pic.data[i + 3] : 0;
    data.set(a > 128 ? [pic.data[i], pic.data[i + 1], pic.data[i + 2], 255] : [10, 20, 30, 255], (y * w + x) * 4);
  }
  return { width: w, height: h, data };
}

test('locates a scaled view inside the picture and recovers the scale', () => {
  const pic = makePicture(300, 80), view = viewOf(pic, 120, 10, 160, 90, 2);
  const found = locateInPicture(pic, view, 2);
  assert.ok(Math.abs(found.x - 120) <= 1 && Math.abs(found.y - 10) <= 1, JSON.stringify(found));
  assert.equal(findPictureScale(pic, view, [1.5, 2, 2.5]).k, 2);
});

test('narrow picture: the in-game window is wider than the whole map', () => {
  const pic = makePicture(70, 160, 3);
  // Screen view 2x, wider than the picture: it shows the full width plus padding on both sides.
  const view = viewOf(pic, -20, 60, 220, 70, 2);
  const found = locateInPicture(pic, view, 2);
  assert.ok(found && Math.abs(found.x + 20) <= 1 && Math.abs(found.y - 60) <= 1, JSON.stringify(found));
});

test('searching near the previous match finds a small move without a full scan', () => {
  const pic = makePicture(300, 80), view = viewOf(pic, 130, 12, 160, 90, 2);
  const found = locateInPicture(pic, view, 2, { near: { x: 124, y: 10 } });
  assert.ok(found.local && Math.abs(found.x - 130) <= 1 && Math.abs(found.y - 12) <= 1, JSON.stringify(found));
});

const pictureMeta = new URL('../fixtures/screens/picture-henesys-rgba.json', import.meta.url);
const present = existsSync(pictureMeta) && existsSync(new URL('../fixtures/screens/henesys-1.rgba', import.meta.url));
test('real screenshot: in-game mini map found in the OSMS picture at the ring-fit scale', { skip: !present && 'fixture not present' }, () => {
  const meta = JSON.parse(readFileSync(pictureMeta, 'utf8'));
  const pic = { width: meta.width, height: meta.height, data: new Uint8ClampedArray(readFileSync(new URL('../fixtures/screens/picture-henesys.rgba', import.meta.url))) };
  const shotMeta = JSON.parse(readFileSync(new URL('../fixtures/screens/henesys-1.json', import.meta.url), 'utf8'));
  const shot = { ...shotMeta, data: new Uint8ClampedArray(readFileSync(new URL('../fixtures/screens/henesys-1.rgba', import.meta.url))) };
  const band = findTitleBand(shot), body = findMarkers(shot, band).body;
  const crop = { width: body.w, height: body.h, data: new Uint8ClampedArray(body.w * body.h * 4) };
  for (let y = 0; y < body.h; y++) crop.data.set(shot.data.subarray(((body.y + y) * shot.width + body.x) * 4, ((body.y + y) * shot.width + body.x + body.w) * 4), y * body.w * 4);
  const found = findPictureScale(pic, crop);
  assert.equal(found.k, 1.47);
  assert.ok(Math.abs(found.x - 101) <= 2 && Math.abs(found.y + 1) <= 2, JSON.stringify(found));
});

const deepMeta = new URL('../fixtures/screens/picture-deepforest-rgba.json', import.meta.url);
test('real screenshot: dark Deep Forest mini map is placed by pattern, not darkness', { skip: !(existsSync(deepMeta) && existsSync(new URL('../fixtures/screens/deepforest-1.rgba', import.meta.url))) && 'fixture not present' }, () => {
  const meta = JSON.parse(readFileSync(deepMeta, 'utf8'));
  const pic = { width: meta.width, height: meta.height, data: new Uint8ClampedArray(readFileSync(new URL('../fixtures/screens/picture-deepforest.rgba', import.meta.url))) };
  const shotMeta = JSON.parse(readFileSync(new URL('../fixtures/screens/deepforest-1.json', import.meta.url), 'utf8'));
  const shot = { ...shotMeta, data: new Uint8ClampedArray(readFileSync(new URL('../fixtures/screens/deepforest-1.rgba', import.meta.url))) };
  const band = findTitleBand(shot), markers = findMarkers(shot, band), body = markers.body;
  assert.ok(body && markers.player, 'narrow mini map window found with the player dot');
  const crop = { width: body.w, height: body.h, data: new Uint8ClampedArray(body.w * body.h * 4) };
  for (let y = 0; y < body.h; y++) crop.data.set(shot.data.subarray(((body.y + y) * shot.width + body.x) * 4, ((body.y + y) * shot.width + body.x + body.w) * 4), y * body.w * 4);
  const found = findPictureScale(pic, crop);
  assert.equal(found.k, 1.47);
  assert.ok(Math.abs(found.x + 1) <= 3 && Math.abs(found.y - 93) <= 3, JSON.stringify(found));
});

test('cuts the see-through strips beside a narrow map off the mini map crop', async () => {
  const { trimSeeThrough } = await import('./picmatch.js');
  const w = 120, h = 60, data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const strip = x < 20 || x >= 100, v = strip ? 190 : 30 + ((x * 7 + y * 3) % 40);
    data.set([v, v, v, 255], (y * w + x) * 4);
  }
  const out = trimSeeThrough({ width: w, height: h, data });
  assert.equal(out.dx, 20); assert.equal(out.crop.width, 80); assert.equal(out.crop.height, 60); assert.equal(out.trimmedX, true);
  const full = trimSeeThrough({ width: 80, height: 60, data: out.crop.data });
  assert.equal(full.dx, 0); assert.equal(full.crop.width, 80);
});

test('a bright edge on one side only (short wide maps) is not a see-through strip', async () => {
  const { trimSeeThrough } = await import('./picmatch.js');
  const w = 120, h = 60, data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const v = y >= 45 ? 200 : 30 + ((x * 7 + y * 3) % 40); data.set([v, v, v, 255], (y * w + x) * 4); }
  const out = trimSeeThrough({ width: w, height: h, data });
  assert.equal(out.dy, 0); assert.equal(out.crop.height, 60); assert.ok(!out.trimmedY);
});

test('a game window over part of the mini map is masked out, the map is kept', async () => {
  const { maskCovered } = await import('./picmatch.js');
  const w = 100, h = 60, data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const inPanel = x >= 60; const v = inPanel ? ((x + y) % 17 === 0 ? 40 : 225) : 30 + ((x * 7 + y * 3) % 40);
    data.set([v, v, v, 255], (y * w + x) * 4);
  }
  const crop = { width: w, height: h, data };
  const share = maskCovered(crop);
  assert.ok(share > .35 && share < .5, `covered ${share}`);
  assert.equal(data[(10 * w + 20) * 4 + 3], 255); assert.equal(data[(10 * w + 80) * 4 + 3], 0);
});
