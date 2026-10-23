import test from 'node:test';
import assert from 'node:assert/strict';
import { findCatalogItem, sellVerdict, listingOpportunities } from './sellcheck.js';

const catalog = [
  { id: '1', name: 'Single Earring', npcPrice: 2250 },
  { id: '2', name: 'Cute Mouse Ears', npcPrice: 1 },
  { id: '3', name: 'Red Potion', npcPrice: 25 },
  { id: '4', name: 'Snail Shell', npcPrice: 2 }
];

test('catalog lookup tolerates OCR slips', () => {
  assert.equal(findCatalogItem('cute mouse ears', catalog).id, '2');
  assert.equal(findCatalogItem('Cute Mouse Fars', catalog).id, '2');
  assert.equal(findCatalogItem('Dragon Scale', catalog), null);
});

test('verdicts', () => {
  assert.equal(sellVerdict({ shopPrice: 1, marketPrice: 75_000 }).choice, 'players');
  assert.equal(sellVerdict({ shopPrice: 25, marketPrice: 28, quantity: 100 }).choice, 'shop');
  assert.equal(sellVerdict({ shopPrice: 2250, marketPrice: 3000, quantity: 1 }).choice, 'either');
  assert.equal(sellVerdict({ shopPrice: 2250, marketPrice: null }).choice, 'unknown');
  assert.equal(sellVerdict({ shopPrice: null, marketPrice: 9000 }).choice, 'players');
  const bulk = sellVerdict({ shopPrice: 2, marketPrice: 10, quantity: 2000 });
  assert.equal(bulk.choice, 'players'); assert.equal(bulk.shopTotal, 4000); assert.equal(bulk.expectedTotal, 18_000);
});

test('listing opportunities rank the biggest gain first', () => {
  const summaries = [
    { item: 'Cute Mouse Ears', sell: { median: 75_000, count: 3 } },
    { item: 'Red Potion', sell: { median: 26, count: 9 } },
    { item: 'Single Earring', sell: { median: 3_500_000, count: 1 } }
  ];
  assert.deepEqual(listingOpportunities(summaries, catalog).map(r => r.item), ['Single Earring', 'Cute Mouse Ears']);
});
