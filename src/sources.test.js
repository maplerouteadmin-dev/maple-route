import test from 'node:test';
import assert from 'node:assert/strict';
import { osmsUrl, isLocalHost } from './sources.js';

test('OSMS files go through the local relay on this PC and straight to OSMS as a website', () => {
  assert.equal(osmsUrl('current/images/maps/1.png', true), '/osms-img/images/maps/1.png');
  assert.equal(osmsUrl('maps/abc.webp', true), '/osms-data/maps/abc.webp');
  assert.equal(osmsUrl('current/map_manifest.json', true), '/osms-img/map_manifest.json');
  assert.equal(osmsUrl('current/images/maps/1.png', false), 'https://osmsdataexplorer.com/data/current/images/maps/1.png');
  assert.equal(isLocalHost('localhost'), true);
  assert.equal(isLocalHost('someone.github.io'), false);
});
