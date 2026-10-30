import test from 'node:test';
import assert from 'node:assert/strict';
import { recommendQuests, questsInText, jobFits, questAvailable } from './questrecs.js';

const catalog = [
  { name: 'Mai\'s First Training', giver: 'Mai', level: 1, job: '' },
  { name: 'The Rescue of Maya', giver: 'Maya', level: 15, job: '' },
  { name: 'Arwen and the Glass Shoe', giver: 'Arwen', level: 25, job: '' },
  { name: 'Pia and the Blue Mushroom', giver: 'Pia', level: 12, job: '' },
  { name: 'Warrior Training', giver: 'Dances with Balrog', level: 14, job: 'Warrior' },
  { name: 'No level quest', giver: 'Mai', level: null, job: '' }
];

test('recommends startable quests near the player level, skipping finished, active and other jobs', () => {
  const recs = recommendQuests(catalog, { level: 15, job: 'Magician', finished: ['Pia and the Blue Mushroom'] });
  assert.deepEqual(recs.map(r => r.name), ['The Rescue of Maya', 'Mai\'s First Training']);
  assert.deepEqual(recommendQuests(catalog, { level: 15, job: 'Warrior', active: ['The Rescue of Maya'] }).map(r => r.name), ['Warrior Training', 'Pia and the Blue Mushroom', 'Mai\'s First Training']);
  assert.equal(jobFits('Warrior', 'Any'), true);
  assert.equal(jobFits('Thief', 'Bowman'), false);
});

test('finds quest names in text read off the quest window', () => {
  const text = 'Completed\nThe Rescue of Maya\nPia and the Blue Mushrom\nsome noise 123\nMai';
  assert.deepEqual(questsInText(text, catalog.map(q => q.name)).sort(), ['Pia and the Blue Mushroom', 'The Rescue of Maya']);
});

test('only suggests quests whose earlier quests are done, and never pre-launch or out-of-season ones', () => {
  const chain = [
    { name: 'Searching for Fossils', level: 17, prerequisites: [] },
    { name: 'Delivering a Box of Fossils', level: 17, prerequisites: ['Searching for Fossils'] },
    { name: 'Old Event', level: 17, type: 'Event', from: '2020-01-01', until: '2020-02-01' },
    { name: 'Beta Only', level: 17, version: 'pre-launch' },
    { name: 'Town Citizen', level: 17, type: 'Citizenship' }
  ];
  assert.deepEqual(recommendQuests(chain, { level: 17 }).map(q => q.name), ['Searching for Fossils']);
  assert.deepEqual(recommendQuests(chain, { level: 17, finished: ['Searching for Fossils'] }).map(q => q.name), ['Delivering a Box of Fossils']);
  assert.equal(questAvailable({ type: 'Event', from: '2026-10-01', until: '2026-11-01' }, new Set(), Date.parse('2026-10-22')), true);
});

test('quest chain lists every earlier quest in order and what it unlocks', async () => {
  const { questChain } = await import('./questrecs.js');
  const chain = [
    { name: 'Searching for Fossils', prerequisites: [] },
    { name: 'Delivering a Box of Fossils', prerequisites: ['Searching for Fossils'] },
    { name: 'Research on Plant Fossils', prerequisites: ['Delivering a Box of Fossils'] },
    { name: 'Research on Animal Fossils', prerequisites: ['Research on Plant Fossils'] }
  ];
  assert.deepEqual(questChain(chain, 'Research on Plant Fossils'), { before: ['Searching for Fossils', 'Delivering a Box of Fossils'], after: ['Research on Animal Fossils'] });
});

test('quests from the in-game Available list come first', () => {
  const recs = recommendQuests(catalog, { level: 15, available: ['Arwen and the Glass Shoe', 'Pia and the Blue Mushroom'], finished: ['Pia and the Blue Mushroom'] });
  assert.equal(recs[0].name, 'Arwen and the Glass Shoe'); assert.equal(recs[0].inGame, true);
  assert.ok(!recs.some(r => r.name === 'Pia and the Blue Mushroom'));
});

test('catalog suggestions wait for a confirmed level while the in-game Available list still works', () => {
  assert.deepEqual(recommendQuests(catalog, { level: null }), []);
  assert.deepEqual(recommendQuests(catalog, { level: null, available: ['The Rescue of Maya'] }).map(row => row.name), ['The Rescue of Maya']);
});

test('quest-line titles from the game window map to the right wiki quests', async () => {
  const { gameQuestNames, questsForGameNames } = await import('./questrecs.js');
  const line = [
    { name: 'Searching for Fossils', arc: "Winston's Fossil Dig-up", arcOrder: 1 },
    { name: 'Delivering a Box of Fossils', arc: "Winston's Fossil Dig-up", arcOrder: 2 },
    { name: 'Pia and the Blue Mushroom' }
  ];
  assert.ok(gameQuestNames(line).includes("Winston's Fossil Dig-up"));
  assert.deepEqual(questsForGameNames(line, ["Winston's Fossil Dig-up", 'Pia and the Blue Mushroom'], { tab: 'available' }), ['Searching for Fossils', 'Pia and the Blue Mushroom']);
  assert.deepEqual(questsForGameNames(line, ["Winston's Fossil Dig-up"], { tab: 'available', finished: ['Searching for Fossils'] }), ['Delivering a Box of Fossils']);
  assert.deepEqual(questsForGameNames(line, ["Winston's Fossil Dig-up"], { tab: 'completed' }), ['Searching for Fossils', 'Delivering a Box of Fossils']);
});

test('names cut short in the quest window still match', () => {
  const names = ["Maple World's Unique Fun: Match Cards", "Maple World's Unique Fun: Omok", "Winston's Fossil Dig-up", 'Pia and the Blue Mushroom'];
  const text = "Henesys (3)\nPia and the Blue Mushroom\nMaple World's Unique Fun: Match...\nMaple World's Unique Fun: Omok\nPerion (1)\nWinston's Fossil Dig-up";
  assert.deepEqual(questsInText(text, names).sort(), names.slice().sort());
});

test('reads the real Available tab text, even with the first word hidden by the quest icon', () => {
  const names = ["Maple World's Unique Fun: Match Cards", "Maple World's Unique Fun: Omok", "Winston's Fossil Dig-up", 'Pia and the Blue Mushroom', "Estelle's Request"];
  const text = "© Pia and the Blue Mushr...\nMaple World's Unique Fun: Match\n! Talk to NPC Pia\nWorld's Unigue Fun: Omok\nFind Pia in Henes\nWinston's Fossil Dig-up";
  assert.deepEqual(questsInText(text, names).sort(), names.slice(0, 4).sort());
});

test('guesses the hand-in NPC from the quest text', async () => {
  const { guessTurnIn } = await import('./questrecs.js');
  const npcs = ['Heena', 'Sera', 'Shane', 'Mr. Thunder'];
  assert.equal(guessTurnIn('Heena asked me to get a mirror from her sister, so I walked all the way to Sera.', npcs, 'Heena'), 'Sera');
  assert.equal(guessTurnIn('I gave Green Mushroom Caps to Shane in Ellinia.', npcs, 'Shane'), 'Shane');
  assert.equal(guessTurnIn('I passed the training.', npcs, 'Olaf'), 'Olaf');
});

test('hand-in guess follows who the action is aimed at, else the giver', async () => {
  const { guessTurnIn } = await import('./questrecs.js');
  const npcs = ['Shumi', 'JM From tha Streetz', 'Sabitrama', 'Shane', 'Arwen the Fairy', 'Grendel the Really Old', 'Jaime the Wandering Explorer', 'Dances with Balrog', 'Warrior Job Instructor', 'Tamya', 'Daniel the Scholar'];
  assert.equal(guessTurnIn("I found Shumi's lost Sack of Cash in the Kerning City subway. Shumi can now buy what JM From tha Streetz asked for.", npcs, 'Shumi'), 'Shumi');
  assert.equal(guessTurnIn('Thankfully, I got the flower that Sabitrama wanted from the Forest of Patience.', npcs, 'Sabitrama'), 'Sabitrama');
  assert.equal(guessTurnIn("I informed Arwen the Fairy of the results of Grendel the Really Old's analysis.", npcs, 'Arwen the Fairy'), 'Arwen the Fairy');
  assert.equal(guessTurnIn('I delivered the scroll to Jaime the Wandering Explorer.', npcs, 'Nyroth'), 'Jaime the Wandering Explorer');
  assert.equal(guessTurnIn('Dances with Balrog in Perion welcomed me warmly, and I gained a new job.', npcs, 'Warrior Job Instructor'), 'Dances with Balrog');
  assert.equal(guessTurnIn('In West Rocky Mountain IV, I met Warrior Job Instructor.', npcs, 'Dances with Balrog'), 'Warrior Job Instructor');
  assert.equal(guessTurnIn("Tamya heard her grandmother's last words.", npcs, 'Daniel the Scholar'), 'Tamya');
  assert.equal(guessTurnIn('Maria looked relieved after reading the reply from Lucas.', ['Maria', 'Lucas'], 'Lucas'), 'Maria');
  assert.equal(guessTurnIn("I couldn't get any answers from Manji, but I saw the battle he fought.", ['Manji', 'Grendel the Really Old'], 'Grendel the Really Old'), 'Grendel the Really Old');
});

test('quest lines with extra text after the name still match', async () => {
  const { questsInText } = await import('./questrecs.js');
  const names = ["Winston's Fossil Dig-up", 'Searching for Fossils', 'Luke the Security Guy'];
  assert.deepEqual(questsInText("Winston's Fossil Dig-up  Lv. 25\nLuke the Security Guy (3/5)", names), ["Winston's Fossil Dig-up", 'Luke the Security Guy']);
  assert.deepEqual(questsInText('Searching for Mushrooms', names), []);
});

test('quest window list rows match a little more loosely (a truncated, misread row)', async () => {
  const { questsInText } = await import('./questrecs.js');
  const names = ["Dr. Betty's Research on Plants", "Winston's Fossil Dig-up", 'Research on Plant Fossils'];
  const row = "| - Perion (1) ed\nOr Betty's Fezearch on PI [";
  assert.deepEqual(questsInText(row, names), []);
  assert.deepEqual(questsInText(row, names, { min: .74 }), ["Dr. Betty's Research on Plants"]);
});


test('quest window rows match word by word (icons in front, cut off, misread letters)', async () => {
  const { questsInText } = await import('./questrecs.js');
  const names = ["Dr. Betty's Research on Plants", 'Research on Plant Fossils', "Winston's Fossil Dig-up", 'Luke the Security Guy'];
  assert.deepEqual(questsInText("J - Perion (1) ed\nEX Cr Betty's Rezoarch an FI |\nDETALLM |", names, { min: .74 }), ["Dr. Betty's Research on Plants"]);
  assert.deepEqual(questsInText("EX Cr Betty's Rezoarch an FI |", names), [], 'whole-screen reads stay strict');
  assert.deepEqual(questsInText('Research done\nPerion (1)', names, { min: .74 }), []);
});

test('same-named quests are told apart by job or town, giver and goal', async () => {
  const { questDetail } = await import('./questrecs.js');
  const thief = { name: 'Test of Qualification', job: 'Thief', level: 30, giver: 'Thief Job Instructor', needs: [{ type: 'item', name: 'Dark Marble', count: 30 }] };
  assert.equal(questDetail(thief, { sameName: 4 }), 'Thief · Lv 30 · from Thief Job Instructor · Dark Marble ×30');
  const kerning = { name: 'The Right to Own a Home', town: 'Kerning City', level: 17, giver: 'Roxy', needs: [] };
  assert.equal(questDetail(kerning, { sameName: 2 }), 'Kerning City · Lv 17 · from Roxy · talk / deliver');
  const fossils = { name: 'Searching for Fossils', level: 15, giver: 'Winston', needs: [{ type: 'mob', name: 'Green Mushroom', count: 25 }, { type: 'item', name: 'Plant Fossil', count: 12 }] };
  assert.equal(questDetail(fossils), 'Lv 15 · from Winston · defeat 25 Green Mushroom, Plant Fossil ×12');
});

