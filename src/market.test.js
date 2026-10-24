import test from 'node:test';
import assert from 'node:assert/strict';
import { customItem, parseMesos, fromOsmsItems, checkListing, statLines, equipSummary, filterListings, priceBook, findCommand, searchItems, validName } from './market.js';

const catalog = fromOsmsItems({ items: [
  { id: 1082000, name: 'Work Gloves', category: 'Equipment', sub_category: 'Glove', stats: { reqLevel: 10, incPDD: 6, tuc: 5 }, req_job_label: 'All', price: 1200 },
  { id: 4000000, name: 'Blue Snail Shell', category: 'Etc', stats: { price: 1 } }
], scrolls: [{ id: 2040805, name: 'Scroll for Gloves for DEX 60%' }] });
const gloves = catalog[0], shell = catalog[1];

test('the catalog keeps equipment stats and upgrade slots from the game files', () => {
  assert.deepEqual([gloves.equip, gloves.slots, gloves.base, gloves.reqLevel], [true, 5, { incPDD: 6 }, 10]);
  assert.deepEqual([shell.equip, shell.slots, shell.base], [false, null, null]);
  assert.equal(catalog[2].category, 'Scroll');
  assert.deepEqual(searchItems(catalog, 'glo').map(i => i.name), ['Work Gloves', 'Scroll for Gloves for DEX 60%']);
});

test('a listing is checked: mesos only, a real character name, sane stats and slots', () => {
  const now = Date.parse('2026-10-24T00:00:00Z');
  const { listing } = checkListing({ side: 'sell', price: '1.5m', ign: 'Mapler01', stats: { incPDD: 6, incDEX: 3 }, slotsLeft: 2, scrolled: 3, channel: '5', note: 'gloves for dex' }, gloves, now);
  assert.deepEqual([listing.price, listing.stats, listing.slots_left, listing.scrolled, listing.channel], [1500000, { incPDD: 6, incDEX: 3 }, 2, 3, 5]);
  assert.equal(listing.expires_at, '2026-10-31T00:00:00.000Z'); // 7 days
  assert.equal(checkListing({ side: 'sell', price: '2m', ign: 'Mapler01' }, shell, now).listing.price, 2000000);
  const bad = checkListing({ side: 'sell', price: '0', ign: 'x', note: 'or $20 paypal', slotsLeft: 9 }, gloves, now).errors;
  assert.equal(bad.length, 4); // price, name, real money, slots
  assert.ok(checkListing({ side: 'buy', price: 5000, ign: 'Mapler01', note: 'see www.site.com' }, shell, now).errors);
  assert.equal(validName('Ab'), false); assert.equal(validName('Mapler01'), true);
});

test('stats are shown against the clean item, with slots left', () => {
  const listing = { side: 'sell', stats: { incPDD: 6, incDEX: 3 }, slots_left: 2, scrolled: 3 };
  assert.deepEqual(statLines(listing, gloves).map(l => [l.label, l.value, l.delta]), [['DEX', 3, 3], ['Weapon Defense', 6, 0]]);
  assert.equal(equipSummary(listing, gloves), '+3 DEX · 2 of 5 slots left · 3 scrolls passed');
  assert.equal(equipSummary({ side: 'sell', stats: { incPDD: 6 }, slots_left: 5 }, gloves), 'clean (base stats) · 5 of 5 slots left');
});

test('search, filters and the price book', () => {
  const now = Date.parse('2026-10-24T00:00:00Z'), later = '2026-10-30T00:00:00Z';
  const listings = [
    { id: 1, side: 'sell', item_id: '1082000', item_name: 'Work Gloves', price: 900000, stats: { incDEX: 3 }, slots_left: 2, expires_at: later },
    { id: 2, side: 'sell', item_id: '1082000', item_name: 'Work Gloves', price: 50000, stats: {}, slots_left: 5, expires_at: later },
    { id: 3, side: 'buy', item_id: '1082000', item_name: 'Work Gloves', price: 40000, expires_at: later },
    { id: 4, side: 'sell', item_id: '1082000', item_name: 'Work Gloves', price: 1, expires_at: '2026-10-01T00:00:00Z' } // expired
  ];
  assert.deepEqual(filterListings(listings, { query: 'work glo', side: 'sell', now }).map(l => l.id), [1, 2]);
  assert.deepEqual(filterListings(listings, { minStats: { incDEX: 2 }, now }).map(l => l.id), [1]);
  assert.deepEqual(filterListings(listings, { minSlots: 5, now }).map(l => l.id), [2]);
  assert.deepEqual(priceBook(filterListings(listings, { now }), '1082000'), { lowestAsk: 50000, highestBid: 40000, sells: 2, buys: 1 });
  assert.equal(findCommand(' Mapler01 '), '/find Mapler01');
});

test('prices accept the usual shorthand', () => {
  assert.deepEqual(['1.5m', '250k', '2b', '1,200,000', '900 mesos', 'abc'].map(parseMesos), [1500000, 250000, 2000000000, 1200000, 900, NaN]);
});

test('a custom item (not in the game files) can be listed, with optional stats and slots', () => {
  const item = customItem('  Red   Bandana of Speed ');
  assert.deepEqual([item.id, item.name, item.custom], ['custom', 'Red Bandana of Speed', true]);
  assert.equal(customItem('x'), null); assert.equal(customItem('buy for $5 paypal'), null);
  const plain = checkListing({ side: 'sell', price: '300k', ign: 'Mapler01', stats: {}, slotsLeft: '', scrolled: '' }, item).listing;
  assert.deepEqual([plain.item_id, plain.item_name, plain.stats, plain.slots_left, plain.scrolled], ['custom', 'Red Bandana of Speed', null, null, null]);
  assert.equal(equipSummary(plain, item), '');
  const statted = checkListing({ side: 'sell', price: '300k', ign: 'Mapler01', stats: { incSpeed: 8 }, slotsLeft: 3 }, item).listing;
  assert.equal(equipSummary(statted, item), '+8 Speed · 3 slots left');
  assert.ok(checkListing({ side: 'sell', price: '1', ign: 'Mapler01', slotsLeft: 30 }, item).errors);
});


test('listings run 7 days; an expired one can be relisted for a fresh 7', async () => {
  const { daysLeft, isExpired, relistCopy } = await import('./market.js');
  const now = Date.parse('2026-10-24T00:00:00Z');
  const live = { id: 'a', owner: 'u', created_at: '2026-10-21T00:00:00Z', expires_at: '2026-10-31T00:00:00Z', item_name: 'Work Gloves', price: 5 };
  assert.deepEqual([daysLeft(live, now), isExpired(live, now)], [7, false]);
  const old = { ...live, expires_at: '2026-10-20T00:00:00Z' };
  assert.deepEqual([daysLeft(old, now), isExpired(old, now)], [0, true]);
  assert.deepEqual(relistCopy(old, now), { item_name: 'Work Gloves', price: 5, expires_at: '2026-10-31T00:00:00.000Z' });
});
