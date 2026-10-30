import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { findStatusBars, statusTextRect, parseStatusText, parseLevel, findQuestHelper, parseQuestHelper, matchQuestTitle, findChatInput, chatLogRect, inkByContrast } from './hud.js';
import { parsePrice, parseTradeLine, parseTradeChat, addTrades, summarizePrices } from './prices.js';
import { createExpTracker, addExpReading, expSummary, sessionFromTracker } from './exptracker.js';

function fixture(name) {
  const base = new URL(`../fixtures/screens/${name}`, import.meta.url);
  const meta = new URL(`${base.href}.json`), raw = new URL(`${base.href}.rgba`);
  if (!existsSync(meta) || !existsSync(raw)) return null;
  const { width, height } = JSON.parse(readFileSync(meta, 'utf8'));
  return { width, height, data: new Uint8ClampedArray(readFileSync(raw)) };
}
const crop = (image, x, y, w, h) => {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let yy = 0; yy < h; yy++) data.set(image.data.subarray(((y + yy) * image.width + x) * 4, ((y + yy) * image.width + x + w) * 4), yy * w * 4);
  return { width: w, height: h, data };
};

test('status text parses HP, MP and EXP, tolerating OCR noise', () => {
  assert.deepEqual(parseStatusText('HP[558/558] MP [448/448] EXP. 5,381 [76.33%]'), { hp: { now: 558, max: 558 }, mp: { now: 448, max: 448 }, exp: { value: 5381, percent: 76.33 } });
  assert.deepEqual(parseStatusText('HP (120|558)  MP[0/448] EXP 5.381 (76,33%)').exp, { value: 5381, percent: 76.33 });
  assert.equal(parseStatusText('HP (558/558) MP 448/448) EXP 5.381 (76.33%)').hp.now, 558);
  assert.equal(parseStatusText('HP[600/558]').hp, null);
  assert.equal(parseLevel(' 15 '), 15); assert.equal(parseLevel('LV.'), null);
});

test('status text recovers a merged percentage bracket when the EXP bar confirms it', () => {
  assert.deepEqual(parseStatusText('EXP 164541479 4%', { expBarFill: .486 }).exp, { value: 16454, percent: 47.94 });
  assert.deepEqual(parseStatusText('EXP 165341481 8%', { expBarFill: .486 }).exp, { value: 16534, percent: 48.18 });
  assert.deepEqual(parseStatusText('EXP 16,454 [47.94%]', { expBarFill: .486 }).exp, { value: 16454, percent: 47.94 });
  assert.deepEqual(parseStatusText('EXP 164541479 4%', { expBarFill: .75 }).exp, { value: 164541479, percent: 4 });
});

test('EXP tracker rejects a backwards amount when the same-level percentage rises', () => {
  const t0 = 1000;
  const first = addExpReading(createExpTracker(t0), { value: 16840, percent: 49.07, level: 23, barFill: .495 }, t0).tracker;
  const bad = addExpReading(first, { value: 16305, percent: 49.26, level: 23, barFill: .505 }, t0 + 5000);
  assert.equal(bad.accepted, false);
  const next = addExpReading(first, { value: 16939, percent: 49.36, level: 23, barFill: .505 }, t0 + 10000);
  assert.equal(next.accepted, true);
  assert.equal(next.tracker.gained, 99);
});

test('quest helper text: title, truncation, progress with misread slashes', () => {
  const parsed = parseQuestHelper('Quest Helper (1/5)\n\ni =\n\nChrishrama in Need of an Appre...\n\n111 Garnet Ore\n\n30 7 30 Dark Stump\n');
  assert.equal(parsed.title, 'Chrishrama in Need of an Appre'); assert.equal(parsed.truncated, true);
  assert.deepEqual(parsed.progress.map(p => [p.have, p.need, p.name]), [[1, 1, 'Garnet Ore'], [30, 30, 'Dark Stump']]);
  assert.equal(parsed.complete, true);
  assert.equal(parseQuestHelper('Quest Helper\nMaya and the Weird Medicine\n3 / 10 Blue Snail Shell').complete, false);
  const names = ['Chrishrama in Need of an Apprentice', 'Chrishrama the Smith', 'Maya and the Weird Medicine'];
  assert.equal(matchQuestTitle('Chrishrama in Need of an Appre', names, true), 'Chrishrama in Need of an Apprentice');
  assert.equal(matchQuestTitle('Maya and the Weird Medicine', names), 'Maya and the Weird Medicine');
  assert.equal(matchQuestTitle('Something Else', names), null);
  assert.equal(matchQuestTitle('Cluishwama in Need of an Appre', names, true), 'Chrishrama in Need of an Apprentice');
  assert.equal(matchQuestTitle('Chrishrama in Heed of an Appre', names, true), 'Chrishrama in Need of an Apprentice');
});

test('trade chat lines become item prices', () => {
  assert.equal(parsePrice('3.5 M'), 3_500_000); assert.equal(parsePrice('75k'), 75_000); assert.equal(parsePrice('1,200,000'), 1_200_000); assert.equal(parsePrice('2p'), null);
  assert.deepEqual(parseTradeLine('AlpacaParka CH39 : [Yellow Square] S> STR11 Earring 3.5 M'), { seller: 'AlpacaParka', kind: 'sell', item: 'STR11 Earring', price: 3_500_000 });
  assert.deepEqual(parseTradeLine('Demonya CH08 : [Cute Mouse Ears] S> 75k'), { seller: 'Demonya', kind: 'sell', item: 'Cute Mouse Ears', price: 75_000 });
  assert.equal(parseTradeLine('kray CH14 : B>scrolled avarice PMO'), null); // no price
  assert.equal(parseTradeLine('AlpacaParka CH39 : or offer me'), null);
  assert.equal(parseTradeChat('Fjonn CH01 : S> Choco Candy Cookie 210k\nrandom words').length, 1);
});

test('price log de-duplicates repeated adverts and summarizes', () => {
  const t0 = 1_000_000;
  let log = addTrades([], [{ seller: 'A', kind: 'sell', item: 'Cute Mouse Ears', price: 75_000 }], t0);
  log = addTrades(log, [{ seller: 'A', kind: 'sell', item: 'Cute Mouse Ears', price: 75_000 }], t0 + 60_000);
  log = addTrades(log, [{ seller: 'B', kind: 'sell', item: 'cute mouse ears', price: 90_000 }, { seller: 'C', kind: 'buy', item: 'Cute Mouse Ears', price: 60_000 }], t0 + 120_000);
  assert.equal(log.length, 3);
  const [row] = summarizePrices(log, 'mouse');
  assert.deepEqual(row.sell, { count: 2, low: 75_000, median: 90_000, high: 90_000 });
  assert.equal(row.buy.count, 1);
});

test('EXP tracker: gains, misread rejection, level-up and death', () => {
  const t0 = 0, min = 60_000;
  let t = createExpTracker(t0);
  t = addExpReading(t, { value: 5000, percent: 50, level: 15, barFill: .5 }, t0).tracker;
  assert.equal(addExpReading(t, { value: 500, percent: 55, barFill: .55 }, t0 + min).accepted, false); // misread value
  assert.equal(addExpReading(t, { value: 5500, percent: 55, barFill: .3 }, t0 + min).accepted, false); // bar disagrees
  t = addExpReading(t, { value: 6000, percent: 60, barFill: .6 }, t0 + 6 * min).tracker;
  t = addExpReading(t, { value: 500, percent: 4, barFill: .04 }, t0 + 30 * min).tracker; // level up: 4000 to finish + 500
  t = addExpReading(t, { value: 400, percent: 3.2, barFill: .032 }, t0 + 31 * min).tracker; // died
  const s = expSummary(t, t0 + 60 * min);
  assert.equal(s.gained, 1000 + 4000 + 500); assert.equal(s.lost, 100); assert.equal(s.levelUps, 1); assert.equal(s.level, 16);
  assert.equal(Math.round(s.perHour), 5500);
  const row = sessionFromTracker(t, t0 + 60 * min);
  assert.equal(row.startLevel, 15); assert.equal(row.endLevel, 16); assert.equal(row.expPerHour, 5500); assert.equal(row.auto, true);
});

test('inkByContrast handles dark-on-light and light-on-dark rows', () => {
  const row = (bg, fg) => [...bg, 255, ...bg, 255, ...fg, 255, ...bg, 255];
  const image = { width: 4, height: 2, data: new Uint8ClampedArray([...row([90, 215, 210], [20, 20, 20]), ...row([230, 180, 40], [255, 255, 255])]) };
  inkByContrast(image);
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6, 7].map(i => image.data[i * 4]), [255, 255, 0, 255, 255, 255, 0, 255]);
});

const shot2 = fixture('henesys-2');
test('real screenshot: status bars, quest helper and chat input', { skip: !shot2 && 'fixture not present' }, () => {
  const bottomY = Math.floor(shot2.height * .8);
  const bars = findStatusBars(crop(shot2, 0, bottomY, shot2.width, shot2.height - bottomY), { offsetY: bottomY });
  assert.ok(bars, 'bars');
  assert.ok(Math.abs(bars.hp.x0 - 737) <= 3 && Math.abs(bars.mp.x0 - 895) <= 3 && Math.abs(bars.exp.x0 - 1060) <= 3, JSON.stringify(bars));
  assert.ok(bars.hp.fill > .97 && bars.mp.fill > .97, 'full HP/MP');
  assert.ok(Math.abs(bars.exp.fill - .7633) < .025, `exp fill ${bars.exp.fill}`);
  const text = statusTextRect(bars);
  assert.ok(text.y < 1085 && text.y + text.h > 1095, JSON.stringify(text));
  const right = Math.floor(shot2.width * .6), helper = findQuestHelper(crop(shot2, right, 0, shot2.width - right, Math.floor(shot2.height * .45)));
  assert.ok(helper && Math.abs(helper.x + right - 1673) < 10 && helper.y > 90 && helper.y < 106 && helper.y + helper.h > 175, JSON.stringify(helper));
  const input = findChatInput(crop(shot2, 0, bottomY, shot2.width, shot2.height - bottomY), { offsetY: bottomY });
  assert.ok(input && Math.abs(input.x - 538) < 8 && Math.abs(input.y - 1034) < 6, JSON.stringify(input));
  const log = chatLogRect(input);
  assert.ok(log.y < 935 && log.y + log.h > 1010 && log.x < 430, JSON.stringify(log));
});

const deep = fixture('deepforest-1');
test('real screenshot: see-through Quest Helper over a dark forest', { skip: !deep && 'fixture not present' }, () => {
  const right = Math.floor(deep.width * .6), helper = findQuestHelper(crop(deep, right, 0, deep.width - right, Math.floor(deep.height * .45)));
  assert.ok(helper && Math.abs(helper.x + right - 1672) < 10 && helper.y > 92 && helper.y < 104 && Math.abs(helper.y + helper.h - 371) < 6, JSON.stringify(helper));
});

test('quest helper text with several quests and misread slashes', () => {
  const parsed = parseQuestHelper('Mr. Thunder in lieed of an Appre...\n0/1 Bronze ingot\n\n0/1 Iron Ingot\n\nFrancois in Need of an Apprentice\n4 / 20 Leaf\n\n0 730 Dark Stump\n\nHow to Enjoy Mushrooms\n\n28 115 Green Mushroom Cap\n\n30 7 30 Green Mushroom');
  assert.deepEqual(parsed.quests.map(q => [q.title, q.truncated, q.complete, q.progress.map(p => `${p.have}/${p.need} ${p.name}`)]), [
    ['Mr. Thunder in lieed of an Appre', true, false, ['0/1 Bronze ingot', '0/1 Iron Ingot']],
    ['Francois in Need of an Apprentice', false, false, ['4/20 Leaf', '0/30 Dark Stump']],
    ['How to Enjoy Mushrooms', false, true, ['28/15 Green Mushroom Cap', '30/30 Green Mushroom']]
  ]);
  assert.equal(parsed.title, 'Mr. Thunder in lieed of an Appre');
});

for (const name of ['questwin-8', 'questwin-9', 'questwin-10', 'questwin-7']) {
  const base = new URL(`../fixtures/screens/${name}`, import.meta.url), meta = new URL(`${base.href}.json`), raw = new URL(`${base.href}.rgba`);
  const present = existsSync(meta) && existsSync(raw);
  test(`quest window on ${name}`, { skip: !present && 'fixture not present' }, async () => {
    const { findQuestWindow } = await import('./hud.js');
    const { width, height, tab } = JSON.parse(readFileSync(meta, 'utf8'));
    const found = findQuestWindow({ width, height, data: new Uint8ClampedArray(readFileSync(raw)) });
    if (tab === 'none') assert.equal(found, null);
    else { assert.ok(found, 'window found'); assert.equal(found.tab, tab, JSON.stringify(found)); }
  });
}

test('quest list inking: dark text stays ink, white text on a blue (selected) row becomes ink too', async () => {
  const { inkQuestList, listChange } = await import('./hud.js');
  const w = 10, data = new Uint8ClampedArray(w * 2 * 4);
  for (let x = 0; x < w; x++) { data.set(x === 3 ? [20, 20, 20, 255] : [255, 255, 255, 255], x * 4); data.set(x === 3 ? [250, 250, 250, 255] : [60, 100, 190, 255], (w + x) * 4); }
  inkQuestList({ width: w, height: 2, data });
  assert.equal(data[3 * 4], 0); assert.equal(data[0], 255);          // white row: text ink, paper white
  assert.equal(data[(w + 3) * 4], 0); assert.equal(data[w * 4], 255); // blue row: white text ink, blue paper
  assert.equal(listChange('1'.repeat(256), '0'.repeat(2) + '1'.repeat(254)), 0); // icon column ignored
});

test('character name is the name line, not the job', async () => {
  const { parseName } = await import('./hud.js');
  assert.equal(parseName('Rogue\nMapler01'), 'Mapler01');
  assert.equal(parseName('Rogue\n'), null);
  assert.equal(parseName('Magician\nNobodies00'), 'Nobodies00');
});

test('trade log keeps the seller so you can contact them, and still catches repeats', async () => {
  const { addTrades } = await import('./prices.js');
  const log = addTrades([], [{ seller: 'AlpacaParka', kind: 'sell', item: 'Cute Mouse Ears', price: 75_000 }], 0);
  assert.equal(log[0].seller, 'AlpacaParka');
  assert.equal(addTrades(log, [{ seller: 'AlpacaParka', kind: 'sell', item: 'Cute Mouse Ears', price: 75_000 }], 60_000).length, 1);
});

test('wrapped Quest Helper lines read as headings go back into the quest above', async () => {
  const { mergeWrappedLines } = await import('./hud.js');
  const needs = {
    'Luke the Security Guy': [{ name: 'Salad', count: 1 }, { name: 'Jr. Necki Skin', count: 10 }, { name: 'Stirge Wing', count: 10 }, { name: 'Jr. Necki', count: 20 }, { name: 'Stirge', count: 20 }],
    'Make a Octopus & Mushroom Omok Set': [{ name: 'Omok Table', count: 1 }, { name: 'Omok Piece: Octopus', count: 1 }, { name: 'Omok Piece: Mushroom', count: 1 }]
  };
  const p = (have, need, name) => ({ have, need, name, done: have >= need });
  // As logged in play: "Luke the Security Guy: 0/1 Salad" then "Jr. Necki Skin: 0/10 Stirge Wing, 0/20 Jr Necki, 0/20 Stirge".
  const luke = mergeWrappedLines([
    { title: 'Luke the Security Guy', name: 'Luke the Security Guy', progress: [p(0, 1, 'Salad')] },
    { title: 'Jr. Necki Skin', name: null, progress: [p(0, 10, 'Stirge Wing'), p(0, 20, 'Jr Necki'), p(0, 20, 'Stirge')] }
  ], name => needs[name]);
  assert.equal(luke.length, 1);
  assert.deepEqual(luke[0].progress.map(x => [x.name, x.have]), [['Salad', 0], ['Jr. Necki Skin', 0], ['Stirge Wing', 0], ['Jr Necki', 0], ['Stirge', 0]]);
  // "Make a Octopus & Mushroom O…: 1/1 Omok Table, 1/1 Omok Piece Octopus" then "Omok Piece: Mushroom:" with no count.
  const omok = mergeWrappedLines([
    { title: 'Make a Octopus  Mushroom O', name: 'Make a Octopus & Mushroom Omok Set', progress: [p(1, 1, 'Omok Table'), p(1, 1, 'Omok Piece Octopus')], complete: true },
    { title: 'Omok Piece: Mushroom', name: null, progress: [] }
  ], name => needs[name]);
  assert.deepEqual(omok[0].progress.map(x => x.name), ['Omok Table', 'Omok Piece Octopus', 'Omok Piece: Mushroom']);
  assert.equal(omok[0].complete, false);
  // A real quest the catalog does not know, with its own unrelated counts, stays separate.
  const kept = mergeWrappedLines([
    { title: 'Luke the Security Guy', name: 'Luke the Security Guy', progress: [] },
    { title: 'Event The Journey Begins', name: null, progress: [p(3, 10, 'Maple Leaf')] }
  ], name => needs[name]);
  assert.equal(kept.length, 2);
});

test('needed counts come from the game data, not the OCR ("0 / 12" read as "0 / 712")', async () => {
  const { fixCounts } = await import('./hud.js');
  const needs = { 'Searching for Fossils': [{ name: 'Plant Fossil', count: 12 }, { name: 'Animal Fossil', count: 12 }, { name: 'Green Mushroom', count: 25 }, { name: 'Axe Stump', count: 25 }] };
  const quests = [{ title: 'Searching for Fossils', name: 'Searching for Fossils', progress: [
    { name: 'Plant Fossil', have: 0, need: 712, done: false },
    { name: 'Animal Fossil', have: 712, need: 12, done: true },   // the slash read into "have"
    { name: 'Green Mushroom', have: 1, need: 25, done: false },
    { name: 'Axe Stump', have: 925, need: 25, done: true }        // nonsense: counted from 0, not done
  ] }];
  fixCounts(quests, name => needs[name]);
  assert.deepEqual(quests[0].progress.map(p => [p.name, p.have, p.need, p.done]), [
    ['Plant Fossil', 0, 12, false], ['Animal Fossil', 12, 12, true], ['Green Mushroom', 1, 25, false], ['Axe Stump', 0, 25, false]
  ]);
  assert.equal(quests[0].complete, false);
});

test('Quest Helper lines show the game names, even when the OCR is garbled', async () => {
  const { fixCounts } = await import('./hud.js');
  const needs = { 'Searching for Fossils': [{ name: 'Plant Fossil', count: 12 }, { name: 'Animal Fossil', count: 12 }, { name: 'Green Mushroom', count: 25 }, { name: 'Axe Stump', count: 25 }] };
  const quests = [{ name: 'Searching for Fossils', progress: [
    { name: 'Plant Foz i', have: 0, need: 12 }, { name: 'Lrimal Fossil', have: 0, need: 12 }, { name: 'Green Mushroom', have: 1, need: 25 }, { name: 'xe tump', have: 0, need: 25 }
  ] }];
  fixCounts(quests, name => needs[name]);
  assert.deepEqual(quests[0].progress.map(p => `${p.have}/${p.need} ${p.name}`), ['0/12 Plant Fossil', '0/12 Animal Fossil', '1/25 Green Mushroom', '0/25 Axe Stump']);
});


test('weekly quests: the Quest Helper line picks the week version, never the first one', async () => {
  const { fixCounts } = await import('./hud.js');
  const versions = [{ name: 'Red Snail Shell', count: 30 }, { name: 'Leaf', count: 30 }, { name: 'Firewood', count: 30 }];
  const [q] = fixCounts([{ name: 'Donating to Kerning City', progress: [{ name: 'Firewod', have: 3, need: 30 }] }], () => versions);
  assert.deepEqual([q.progress[0].name, q.progress[0].have, q.progress[0].need], ['Firewood', 3, 30]);
});
