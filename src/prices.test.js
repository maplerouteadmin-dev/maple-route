import test from 'node:test';
import assert from 'node:assert/strict';

test('trade-chat misreads of one item are grouped under its real name', async () => {
  const { itemNamer, summarizePrices } = await import('./prices.js');
  const namer = itemNamer(['Mushmom Spore', 'Frameless Glasses', 'Work Gloves', 'Meat']);
  assert.equal(namer('Mushmom Spare'), 'Mushmom Spore');
  assert.equal(namer('Frarmeless Glasses'), 'Frameless Glasses');
  assert.equal(namer('Meet'), null); // too short to guess
  assert.equal(namer('Steel Avarice'), null); // not close to anything
  const log = [
    { item: 'Mushmom Spore', key: 'mushmom spore', kind: 'buy', price: 50000, at: 3 },
    { item: 'Mushmom Spare', key: 'mushmom spare', kind: 'buy', price: 50000, at: 2 },
    { item: 'Mushmam Spore', key: 'mushmam spore', kind: 'buy', price: 60000, at: 1 }
  ];
  assert.equal(summarizePrices(log).length, 3);
  const grouped = summarizePrices(log, '', namer);
  assert.deepEqual([grouped.length, grouped[0].item, grouped[0].buy.count, grouped[0].buy.median], [1, 'Mushmom Spore', 3, 50000]);
  assert.equal(summarizePrices(log, 'spare', namer).length, 1); // a search for the misread still finds it
});
