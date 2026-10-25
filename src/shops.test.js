import test from 'node:test';
import assert from 'node:assert/strict';
import { fromWikiShops, usableShops, sellersOf, citizenshipNote } from './shops.js';

const shops = fromWikiShops([{ page: 'Raymond', npc: 'Raymond', map: 'Henesys Town Hall', town: 'Henesys' }, { page: 'Max', npc: 'Max', map: 'Kerning City Civic Center', town: 'Kerning City' }, { page: '24 Hr Mobile Store', npc: '24 Hr Mobile Store', map: 'Ant Tunnel Park', town: 'Sleepywood' }],
  [{ 'shop id': 'Raymond', 'item id': 'Salad', price: '220', 'citizenship grade': '2' }, { 'shop id': 'Max', 'item id': 'Salad', price: '220', 'citizenship grade': '2' }, { 'shop id': '24 Hr Mobile Store', 'item id': 'Salad', price: '220' },
   { 'shop id': 'Raymond', 'item id': 'Elixir', price: '3000', 'citizenship grade': '7' }]);

test('shops a character can use, by citizenship grade per town', () => {
  assert.equal(usableShops(shops, null), shops); // not set: every shop
  const none = usableShops(shops, { Henesys: 0, 'Kerning City': 0 });
  assert.deepEqual(sellersOf(none, 'Salad').map(s => s.npc), ['24 Hr Mobile Store']);
  assert.deepEqual(sellersOf(none, 'Elixir'), []); // town hall only: not buyable
  const visitor = usableShops(shops, { Henesys: 2, 'Kerning City': 0 });
  assert.deepEqual(sellersOf(visitor, 'Salad').map(s => s.npc).sort(), ['24 Hr Mobile Store', 'Raymond']);
  assert.equal(citizenshipNote(sellersOf(shops, 'Elixir')[0]), 'needs Henesys citizenship, grade 7 (Distinguished Citizen)');
});
