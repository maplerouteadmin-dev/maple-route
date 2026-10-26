import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { PNG } from 'pngjs';
import { findTitleBand } from '../src/minimap.js';
import { titleSignature, signatureChanged } from '../src/screen.js';
import { resolveMapHandoff } from '../src/maphandoff.js';

const base = new URL('../fixtures/screens/', import.meta.url);
const manifestUrl = new URL('deck-replay.json', base);
const replay = existsSync(manifestUrl) ? JSON.parse(readFileSync(manifestUrl, 'utf8')) : null;

function frame(name, scale = 1) {
  const path = new URL(name, base);
  if (!path.pathname.startsWith(base.pathname) || !name.endsWith('.png')) throw new Error('Invalid private fixture path');
  const image = PNG.sync.read(readFileSync(path));
  if (scale === 1) return image;
  const width = Math.round(image.width * scale), height = Math.round(image.height * scale);
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const from = (Math.floor(y / scale) * image.width + Math.floor(x / scale)) * 4;
    data.set(image.data.subarray(from, from + 4), (y * width + x) * 4);
  }
  return { width, height, data };
}

const band = image => findTitleBand(image, 'left', { regionW: 1, regionH: .5, frameHeight: 800 });

test('private Deck frames pause old-map tracking on a changed title and a covered mini map',
  { skip: !replay && 'private replay fixtures absent' }, () => {
    const oldFrame = frame(replay.visible), newFrame = frame(replay.changed, replay.changedScale);
    const oldBand = band(oldFrame), newBand = band(newFrame);
    assert.ok(oldBand, 'visible Deck title');
    assert.ok(newBand, 'changed Deck title');
    const oldSignature = titleSignature({ image: oldFrame, band: oldBand });
    const newSignature = titleSignature({ image: newFrame, band: newBand });
    assert.equal(signatureChanged(newSignature, oldSignature), true);
    const unreadable = resolveMapHandoff({ current: 'old', titleChanged: true });
    assert.equal(unreadable.mapId, 'old');
    assert.equal(unreadable.settling, true);
    const pending = resolveMapHandoff({ current: 'old', recognized: 'new', titleChanged: true });
    assert.equal(pending.settling, true);
    const confirmed = resolveMapHandoff({ current: 'old', pending: pending.pending, recognized: 'new', titleChanged: true });
    assert.equal(confirmed.mapId, 'new');
    assert.equal(confirmed.settling, false);
    assert.equal(band(frame(replay.covered)), null, 'inventory overlay must not impersonate the mini map');
  });
