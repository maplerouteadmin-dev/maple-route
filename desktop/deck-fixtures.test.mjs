import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { deckSizedFrame, pictureScaleForWidth } from './deck-fixtures.mjs';
import { findTitleBand, findMarkers } from '../src/minimap.js';
import { findQuestWindow, findStatusBars, findQuestHelper } from '../src/hud.js';

test('Deck estimate and private fixture transform are 1280 by 800', () => {
  assert.ok(Math.abs(pictureScaleForWidth(1280) - .937) < .001);
  const image = { width: 2, height: 1, data: new Uint8ClampedArray([255, 0, 0, 255, 0, 255, 0, 255]) };
  const out = deckSizedFrame(image, 4, 4);
  assert.deepEqual([out.width, out.height, out.contentHeight], [4, 4, 2]);
  assert.deepEqual([...out.data.slice(0, 4)], [255, 0, 0, 255]);
  assert.deepEqual([...out.data.slice(3 * 4, 4 * 4)], [0, 255, 0, 255]);
  assert.deepEqual([...out.data.slice(3 * 4 * 4, 3 * 4 * 4 + 4)], [0, 0, 0, 0]);
});

function fixture(name) {
  const base = new URL(`../fixtures/screens/deck-sim-${name}`, import.meta.url);
  const meta = new URL(`${base.href}.json`), raw = new URL(`${base.href}.rgba`);
  if (!existsSync(meta) || !existsSync(raw)) return null;
  const { width, height } = JSON.parse(readFileSync(meta, 'utf8'));
  return { width, height, data: new Uint8ClampedArray(readFileSync(raw)) };
}
function crop(image, x, y, width, height) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let row = 0; row < height; row++) data.set(image.data.subarray(((y + row) * image.width + x) * 4, ((y + row) * image.width + x + width) * 4), row * width * 4);
  return { width, height, data };
}

const map = fixture('henesys-1-1366');
test('simulated Deck-sized mini map title, frame and markers', { skip: !map && 'private fixture absent' }, () => {
  const band = findTitleBand(map);
  assert.ok(band, 'mini map title strip');
  const markers = findMarkers(map, band);
  assert.ok(markers.body, 'mini map body');
  assert.ok(markers.player, 'player dot');
  assert.ok(markers.portals.length >= 3, 'portal rings');
});

const hud = fixture('henesys-2');
test('simulated Deck-sized status bars and Quest Helper', { skip: !hud && 'private fixture absent' }, () => {
  const bottomY = Math.floor(hud.height * .8);
  const bars = findStatusBars(crop(hud, 0, bottomY, hud.width, hud.height - bottomY), { offsetY: bottomY });
  assert.ok(bars, 'status bars');
  const right = Math.floor(hud.width * .6);
  assert.ok(findQuestHelper(crop(hud, right, 0, hud.width - right, Math.floor(hud.height * .45))), 'Quest Helper');
});

const quest = fixture('questwin-8');
test('simulated Deck-sized quest window', { skip: !quest && 'private fixture absent' }, () => {
  assert.equal(findQuestWindow(quest)?.tab, 'completed');
});
