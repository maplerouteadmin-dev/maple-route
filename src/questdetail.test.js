import test from 'node:test';
import assert from 'node:assert/strict';
import { identifyQuestDetail } from './questdetail.js';

const catalog = [
  { name: 'Searching for Fossils', arc: "Winston's Fossil Dig-up", giver: 'Winston', text: 'Winston in Perion is studying fossils.\nHe needs Plant Fossils from Axe Stumps near Perion.\nI brought the fossils to Winston.', needs: [{ name: 'Plant Fossil' }] },
  { name: 'Delivering a Box of Fossils', arc: "Winston's Fossil Dig-up", giver: 'Winston', turnIn: 'Arwen', text: 'Winston packed the fossils in a box.\nTake the box of fossils to Arwen in Ellinia.\nArwen thanked me for the box.', needs: [] },
  { name: 'Pia and the Blue Mushroom', giver: 'Pia', text: 'Pia in Henesys wants Blue Mushroom Caps.\nCollect Blue Mushroom Caps for Pia.\nPia was delighted.', needs: [{ name: 'Blue Mushroom Cap' }] },
  { name: 'Test of Qualification', job: 'Thief', giver: 'Thief Job Instructor', text: 'The Thief Job Instructor in Kerning City has a test.\nCollect Dark Marbles in the test hall.\nPassed.', needs: [{ name: 'Dark Marble' }] },
  { name: 'Test of Qualification', job: 'Warrior', giver: 'Warrior Job Instructor', text: 'The Warrior Job Instructor near Perion has a test.\nCollect Dark Marbles in the test hall.\nPassed.', needs: [{ name: 'Dark Marble' }] }
];

test('the open quest is found among list rows from its details', () => {
  // The list (short titles of other quests) plus the open quest's details, misread here and there.
  const text = "Perion (2)\nWinston's Fossil Dig-up\nPia and the Blue Mushr...\nDelivering a Box of Fossils\nWinston packed the fossils in a b0x.\nTake the box of fossils to Arwen in Ellinia.\nNPC: Winston";
  assert.equal(identifyQuestDetail(text, catalog)?.quest.name, 'Delivering a Box of Fossils');
});

test('same-named quests are told apart by their details', () => {
  const text = 'Test of Qualification\nThe Thief Job Instructor in Kerning City has a test.\nDark Marble 0/30';
  const found = identifyQuestDetail(text, catalog);
  assert.equal(found?.quest.job, 'Thief');
});

test('only a list (no details open) or noise identifies nothing', () => {
  assert.equal(identifyQuestDetail("Perion (2)\nWinston's Fossil Dig-up\nPia and the Blue Mushr...", catalog), null);
  assert.equal(identifyQuestDetail('HP 120 MP 40', catalog), null);
  assert.equal(identifyQuestDetail('', catalog), null);
});
