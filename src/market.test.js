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

test('offers: allowed or not, a lowest offer, and the checks a buyer meets', async () => {
  const { checkOffer, offerTerms } = await import('./market.js');
  const now = Date.parse('2026-10-24T00:00:00Z');
  const posted = checkListing({ side: 'sell', price: '2m', ign: 'Mapler01', minOffer: '1.5m' }, shell, now).listing;
  assert.deepEqual([posted.offers_allowed, posted.min_offer], [true, 1500000]);
  assert.deepEqual(checkListing({ side: 'sell', price: '2m', ign: 'Mapler01', offersAllowed: false, minOffer: '1m' }, shell, now).listing.min_offer, null);
  assert.ok(checkListing({ side: 'sell', price: '2m', ign: 'Mapler01', minOffer: '3m' }, shell, now).errors); // above the asking price
  assert.equal(checkListing({ side: 'buy', price: '2m', ign: 'Mapler01' }, shell, now).listing.offers_allowed, false);
  const listing = { ...posted, id: 'L1', owner: 'seller', quantity: 1 };
  assert.equal(offerTerms(listing), 'Offers from 1,500,000 mesos');
  assert.deepEqual(checkOffer({ price: '1.6m', ign: 'Buyer01', note: 'can meet now' }, listing, { me: 'buyer', now }).offer, { listing_id: 'L1', price: 1600000, quantity: 1, ign: 'Buyer01', note: 'can meet now' });
  assert.match(checkOffer({ price: '1m', ign: 'Buyer01' }, listing, { me: 'buyer', now }).errors.join(), /lowest offer is 1,500,000/);
  assert.match(checkOffer({ price: '1.6m', ign: 'Buyer01' }, listing, { me: 'seller', now }).errors.join(), /your own listing/);
  assert.match(checkOffer({ price: '1.6m', ign: 'Buyer01' }, { ...listing, offers_allowed: false }, { me: 'buyer', now }).errors.join(), /fixed price/);
  assert.match(checkOffer({ price: '1.6m', ign: 'Buyer01', note: 'or $10 paypal' }, listing, { me: 'buyer', now }).errors.join(), /real-money/);
  assert.equal(offerTerms({ ...listing, offers_allowed: false }), 'Fixed price: no offers');
});

test('filters: category, type (weapon kind), job, level, scroll success, cash items, sorting', async () => {
  const { fromOsmsItems, catalogFacets, filterListings, sortListings, forJob } = await import('./market.js');
  const cat = fromOsmsItems({ items: [
    { id: 1452002, name: 'War Bow', category: 'Equipment', sub_category: 'Weapon', req_job_label: 'Bowman', stats: { reqLevel: 20, incPAD: 40, tuc: 7 } },
    { id: 1040002, name: 'White Undershirt', category: 'Equipment', sub_category: 'Top', req_job_label: 'All', stats: { reqLevel: 0, tuc: 7 } },
    { id: 1302000, name: 'Sword', category: 'Equipment', sub_category: 'Weapon', req_job_label: 'Warrior/Thief', stats: { reqLevel: 0, incPAD: 17, tuc: 7 } }
  ], scrolls: [{ id: 2040805, name: 'Scroll for Gloves for DEX 60%', equip_slot: 'Gloves', stat_type: 'DEX', success_rate: 60 }, { id: 2040804, name: 'Scroll for Gloves for DEX 10%', equip_slot: 'Gloves', success_rate: 10 }] },
  { categories: [{ category: 'Pet', items: [{ id: 5000000, name: 'Brown Kitty' }] }] });
  const byId = new Map(cat.map(i => [i.id, i])), itemOf = l => byId.get(l.item_id);
  assert.equal(byId.get('1452002').type, 'Bow'); assert.equal(byId.get('1302000').type, 'One-Handed Sword');
  assert.deepEqual([byId.get('5000000').category, byId.get('5000000').type], ['Cash', 'Pet']);
  assert.deepEqual(catalogFacets(cat).Equipment, ['Bow', 'One-Handed Sword', 'Top']);
  assert.equal(forJob(byId.get('1302000'), 'Thief'), true); assert.equal(forJob(byId.get('1452002'), 'Thief'), false);
  const later = '2026-11-30T00:00:00Z', now = Date.parse('2026-10-24T00:00:00Z');
  const L = (id, item_id, price, created, expires = later) => ({ id, side: 'sell', item_id, item_name: byId.get(item_id)?.name ?? 'Thing', price, created_at: created, expires_at: expires });
  const listings = [L(1, '1452002', 900, '2026-10-20'), L(2, '1040002', 50, '2026-10-22'), L(3, '1302000', 300, '2026-10-23', '2026-10-25T00:00:00Z'), L(4, '2040805', 400, '2026-10-21'), L(5, '2040804', 20, '2026-10-21'), L(6, '5000000', 5000, '2026-10-19'), { ...L(7, 'custom', 70, '2026-10-18'), item_id: 'custom', item_name: 'Odd Hat' }];
  const ids = f => filterListings(listings, { ...f, itemOf, now }).map(l => l.id);
  assert.deepEqual(ids({ category: 'Equipment' }), [1, 2, 3]);
  assert.deepEqual(ids({ category: 'Equipment', type: 'Bow' }), [1]);
  assert.deepEqual(ids({ job: 'Thief' }), [2, 3]); // All + Warrior/Thief
  assert.deepEqual(ids({ minLevel: 10 }), [1]);
  assert.deepEqual(ids({ category: 'Scroll', minSuccess: 60 }), [4]);
  assert.deepEqual(ids({ category: 'Cash' }), [6]);
  assert.deepEqual(ids({ category: 'Custom' }), [7]);
  assert.deepEqual(sortListings(listings, 'price-desc').map(l => l.id).slice(0, 2), [6, 1]);
  assert.deepEqual(sortListings(listings, 'newest').map(l => l.id)[0], 3);
  assert.deepEqual(sortListings(listings, 'ending').map(l => l.id)[0], 3);
});

test('only tradeable items can be listed', async () => {
  const { fromOsmsItems, searchItems, checkListing } = await import('./market.js');
  const cat = fromOsmsItems({ items: [
    { id: 4031000, name: "Roger's Apple", category: 'Etc', stats: { tradeBlock: '1' } },
    { id: 4031001, name: "Sera's Mirror", category: 'Etc', stats: { quest: 1 } },
    { id: 4000000, name: 'Blue Snail Shell', category: 'Etc', stats: {} }
  ] });
  assert.deepEqual(cat.map(i => i.tradeable), [false, false, true]);
  assert.deepEqual(searchItems(cat, 's').map(i => i.name), ['Blue Snail Shell']);
  assert.match(checkListing({ side: 'sell', price: '1k', ign: 'Mapler01' }, cat[1]).errors.join(), /cannot be traded/);
});

test('an item tooltip read off the screen becomes a listing draft', async () => {
  const { parseTooltip, fromOsmsItems } = await import('./market.js');
  const cat = fromOsmsItems({ items: [
    { id: 1452002, name: 'War Bow', category: 'Equipment', sub_category: 'Weapon', req_job_label: 'Bowman', stats: { reqLevel: 10, incPAD: 30, tuc: 7 } },
    { id: 1452003, name: 'Wooden Bow', category: 'Equipment', sub_category: 'Weapon', req_job_label: 'Bowman', stats: { reqLevel: 5, incPAD: 20, tuc: 7 } },
    { id: 4000000, name: 'Blue Snail Shell', category: 'Etc', stats: {} }
  ] });
  // OCR of a tooltip, with the usual slips (| for I, stray spaces).
  const text = 'War Bow\nREQ LEV : 10\nREQ DEX : 25\nCategory : Bow\nAttack Speed : Normal\nDEX : +3\nWeapon Attack : 33\nAccuracy: +2\nNumber of upgrades available : 4\n[trade chat] S> Wooden Bow 50k';
  const read = parseTooltip(text, cat);
  assert.equal(read.item.name, 'War Bow');
  assert.deepEqual(read.stats, { incDEX: 3, incPAD: 33, incACC: 2 });
  assert.equal(read.slotsLeft, 4);
  assert.equal(parseTooltip('Blue Snai1 Shell\nQuantity : 30', cat).item.name, 'Blue Snail Shell'); // a 1 read for l
  assert.deepEqual(parseTooltip('Blue Snail Shell', cat).stats, {});
  assert.equal(parseTooltip('nothing useful here', cat).item, null);
});

test('real tooltip reads: matched by description, chat adverts ignored', async () => {
  const { parseTooltip, fromOsmsItems } = await import('./market.js');
  const cat = fromOsmsItems({ items: [
    { id: 2000002, name: 'White Potion', category: 'Consumable', description: 'A highly concentrated potion made out of red herbs.\nRestores 500 HP.' },
    { id: 2000001, name: 'Orange Potion', category: 'Consumable', description: 'A concentrated potion made out of red herbs.\nRestores 250 HP.' },
    { id: 2000000, name: 'Red Potion', category: 'Consumable', description: 'A potion made out of red herbs.\nRestores 100 HP.' },
    { id: 2010004, name: 'Orange', category: 'Consumable', description: 'A sweet, tasty orange.\nRestores around 50 MP.' },
    { id: 2010009, name: 'Meat', category: 'Consumable', description: 'Tasty-looking meat.\nRestores around 160 HP.' },
    { id: 2070000, name: 'Subi Throwing Stars', category: 'Consumable', description: 'Throwing stars made out of steel. Once they run out, they need to be recharged.' },
    { id: 2070006, name: 'Ilbi Throwing Stars', category: 'Consumable', description: 'Throwing stars made out of steel. Once they run out, they need to be recharged.' },
    { id: 1372999, name: 'Soft Chocolate Fondue Scepter', category: 'Equipment', sub_category: 'Weapon', stats: { tuc: 7 } }
  ] });
  // Text as Live GPS read it in play (inventory tooltips + trade chat), player names left out.
  const orangePotion = 'ITEM INVENTORY\nSli\nA concentrated potion made out\n1,\nof red herbs\nRestores 250 HP\nKumbi 3\nets\n280K each\nft Chocolate Fondue Scepter PMO\nHP e46/646';
  assert.equal(parseTooltip(orangePotion, cat).item.name, 'Orange Potion');
  const orange = 'ITEM INVENTORY\nA sweet, tasty orange.\n1\n118\nRestores around 50 MP\nB> Kumbi 3 sets\nscepter PMO';
  assert.equal(parseTooltip(orange, cat).item.name, 'Orange');
  const stars = 'Pinca N SHE q subi Throwing stars\nREQ LEV : 10\nThrowing stars made out of\nsteel. Once they run out, they\nneed to be recharged\nAttack +15\nKumbi 3\nsets\n280K each\nft Chocolate Fondue Scepter PMO';
  assert.equal(parseTooltip(stars, cat).item.name, 'Subi Throwing Stars');
  assert.equal(parseTooltip('ft Chocolate Fondue Scepter PMO\nB> Meat 10k each', cat).item, null); // only chat: nothing
});

test('market alerts: offers waiting, answers to your offers, expired and ending listings', async () => {
  const { marketAlerts } = await import('./market.js');
  const now = Date.parse('2026-10-24T12:00:00Z');
  const mine = [
    { id: 'L1', item_name: 'War Bow', expires_at: '2026-10-28T00:00:00Z' },
    { id: 'L2', item_name: 'Work Gloves', expires_at: '2026-10-24T00:00:00Z' }, // expired
    { id: 'L3', item_name: 'Ilbi', expires_at: '2026-10-24T20:00:00Z' } // ends in 8 h
  ];
  const listings = [{ id: 'X1', item_name: 'Red Bandana', ign: 'Seller01' }];
  const offers = [
    { id: 'o1', listing_id: 'L1', owner: 'buyer', ign: 'Buyer01', price: 800000, status: 'open', created_at: '2026-10-24T11:00:00Z' },
    { id: 'o2', listing_id: 'L1', owner: 'buyer', ign: 'Buyer02', price: 750000, status: 'declined', created_at: '2026-10-24T10:00:00Z' }, // answered by me: no alert
    { id: 'o3', listing_id: 'X1', owner: 'me', ign: 'Mapler01', price: 50000, status: 'accepted', created_at: '2026-10-24T09:00:00Z' },
    { id: 'o4', listing_id: 'X1', owner: 'me', ign: 'Mapler01', price: 40000, status: 'declined', created_at: '2026-10-24T08:00:00Z' }
  ];
  const alerts = marketAlerts({ mine, offers, listings, me: 'me', seen: ['o4'], now });
  assert.deepEqual(alerts.map(a => a.kind).sort(), ['accepted', 'ending', 'expired', 'offer']);
  assert.match(alerts.find(a => a.kind === 'accepted').text, /accepted: whisper Seller01/);
  assert.match(alerts.find(a => a.kind === 'ending').text, /ends in 8 h/);
  assert.equal(marketAlerts({ mine: [], offers: [], me: 'me', now }).length, 0);
});

