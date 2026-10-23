import test from 'node:test';
import assert from 'node:assert/strict';
import { recipeFor, remainingIngredients, parseShopRows } from './gear.js';

test('starter recipe lookup is case insensitive and missing recipes stay unknown', () => {
  assert.equal(recipeFor('blue bandana').profession, 'Tailoring');
  assert.equal(recipeFor('not documented'), null);
});

test('material counts are clamped and shortages are computed', () => {
  const recipe = recipeFor('Blue Bandana');
  const result = remainingIngredients(recipe, { 'Processed Cloth': 1, 'Blue Snail Shell': 99 });
  assert.deepEqual(result.map(row => row.remaining), [1, 0, 3]);
  assert.equal(result[1].owned, 10);
});

test('shop rows reject missing names and prices', () => {
  const rows = parseShopRows([{ _pageName: 'Sam', price: '1000', 'item id': 'Blue Bandana' }, { price: '20' }, { _pageName: 'Other', price: 'n/a' }]);
  assert.deepEqual(rows, [{ name: 'Sam', price: 1000, item: 'Blue Bandana' }]);
});
