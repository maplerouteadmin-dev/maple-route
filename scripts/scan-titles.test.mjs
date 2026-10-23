import test from 'node:test';
import assert from 'node:assert/strict';
import { validateDataset } from '../src/core.js';
import { scanTitles } from './scan-titles.mjs';

// The kinds of names the full scan (node scripts/scan-titles.mjs) found going wrong.
test('tricky map titles read right, clean and misread', () => {
  const area = street => name => ({ id: name, name, aliases: [`${street} ${name}`] });
  const hidden = area('Hidden Street'), road = area('Victoria Road'), dungeon = area('Dungeon'), subway = area('Kerning City Subway');
  const maps = validateDataset({ schemaVersion: 1, portals: [], maps: [
    road('Camp 1'), road('Camp 2'), road('Camp 3'), road('Henesys'), road('Henesys Hunting Ground I'), road('Henesys Hunting Ground II'), road('Henesys Hunting Ground III'), road('L Forest I'), road('L Forest II'), road('L Forest III'),
    hidden('Free Market <1>'), hidden('Free Market <2>'), hidden('Free Market <11>'),
    hidden('The Forest of Evil I'), hidden('The Forest of Evil II'), hidden('Dangerous Valley'), hidden('Dangerous Valley II'),
    dungeon('Ant Tunnel I'), dungeon('Ant Tunnel II'), dungeon('Ant Tunnel IV'), dungeon('Deep Ant Tunnel I'), dungeon('Deep Ant Tunnel II'),
    subway('Line 1 <Area 1>'), subway('Line 1 <Area 2>'), { id: 'tb', name: 'Truth Booth', aliases: ['Truth Booth Truth Booth'] }
  ] }).maps;
  assert.deepEqual(scanTitles(maps), []);
});
