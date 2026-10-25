import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { cacheDir, cacheFile, relayUrl } from './osmscache.mjs';

test('Linux cache follows XDG data home and defaults to ~/.local/share', () => {
  assert.equal(cacheDir('linux', { HOME: '/home/deck' }), join('/home/deck', '.local', 'share', 'MapleRoute', 'cache'));
  assert.equal(cacheDir('linux', { HOME: '/home/deck', XDG_DATA_HOME: '/data' }), join('/data', 'MapleRoute', 'cache'));
  assert.equal(cacheDir('win32', { LOCALAPPDATA: 'C:/Users/Test/AppData/Local' }), join('C:/Users/Test/AppData/Local', 'MapleRoute', 'cache'));
});

test('relay paths map to OSMS and to files inside the cache folder only', () => {
  assert.equal(relayUrl('/osms-img/images/maps/010001030.png'), 'https://osmsdataexplorer.com/data/current/images/maps/010001030.png');
  const dir = join('C:', 'cache');
  assert.equal(cacheFile('https://osmsdataexplorer.com/data/current/images/maps/1.png', dir), join(dir, 'data', 'current', 'images', 'maps', '1.png'));
  const sneaky = cacheFile('https://osmsdataexplorer.com/data/../../../x.png', dir);
  assert.ok(sneaky === null || sneaky.startsWith(dir));
});
