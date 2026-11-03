import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSteps, currentStep, questPlaces, questClue } from './queststeps.js';

test('The Old Snail asks for the book from Pia, never a Snail hunt', () => {
  const quest = { name: 'The Old Snail', giver: 'Pia', turnIn: 'Jay', needs: [{ type: 'item', name: 'The Snail Legend', count: 1 }] };
  const steps = buildSteps(quest);
  assert.match(steps[1].title, /given when you accepted/);
  assert.equal(steps[1].item, 'The Snail Legend');
  assert.equal(steps[2].npc, 'Jay');
});

const pia = { name: 'Pia and the Blue Mushroom', giver: 'Pia', turnIn: 'Pia', needs: [{ type: 'mob', name: 'Blue Mushroom', count: 20 }, { type: 'item', name: 'Blue Mushroom Cap', count: 10 }] };

test('steps come from the game data when the wiki has none', () => {
  const steps = buildSteps(pia, []);
  assert.deepEqual(steps.map(s => s.title), ['Talk to Pia to start', 'Defeat 20 Blue Mushroom', 'Collect 10 Blue Mushroom Cap', 'Hand it in to Pia']);
  assert.equal(steps[1].monster, 'Blue Mushroom'); assert.equal(steps[3].npc, 'Pia');
});

test('a delivery quest says the giver supplies its item instead of adding a collection step', () => {
  const steps = buildSteps({ giver: 'Manji', turnIn: 'Sophia', startItems: [{ name: "Arcon's Blood" }], needs: [] });
  assert.deepEqual(steps.map(step => step.title), ["Talk to Manji to start (receive Arcon's Blood)", 'Hand it in to Sophia']);
  assert.equal(currentStep(steps, [], { accepted: true, giver: 'Manji' }).step.npc, 'Sophia');
});

test('wiki conversation steps explain an item received on acceptance', () => {
  const quest = { giver: 'Manji', turnIn: 'Sophia', startItems: [{ name: "Arcon's Blood" }], needs: [{ type: 'item', name: 'Leaf', count: 30 }] };
  const steps = buildSteps(quest, [{ number: 1, title: 'Talk to Manji', npc: 'Manji' }, { number: 2, title: 'Collect 30 Leaves', monster: 'Dark Stump' }, { number: 3, title: "Take Arcon's Blood to Sophia", npc: 'Sophia' }]);
  assert.equal(steps[0].title, "Talk to Manji (receive Arcon's Blood)");
  assert.equal(steps.some(step => /collect.*arcon/i.test(step.title)), false);
  assert.equal(currentStep(steps, [], { accepted: true, giver: 'Manji' }).step.title, 'Collect 30 Leaves');
});

test('Roger tutorial keeps the use-item action after its supplied apple is removed from farming', () => {
  const steps = buildSteps({ giver: 'Roger', startItems: [{ name: "Roger's Apple" }], startAction: "Use Roger's Apple from your inventory", needs: [] });
  assert.deepEqual(steps.map(step => step.title), ["Talk to Roger to start (receive Roger's Apple)", "Use Roger's Apple from your inventory", 'Hand it in to Roger']);
});

test('the wiki steps are kept, with game objectives they omit added before hand-in', () => {
  const steps = buildSteps(pia, [{ number: 1, title: 'Talk to Pia', npc: 'Pia' }, { number: 2, title: 'Collect caps', monster: '' }]);
  assert.deepEqual(steps.map(step => step.title), ['Talk to Pia', 'Collect caps', 'Defeat 20 Blue Mushroom', 'Collect 10 Blue Mushroom Cap', 'Hand it in to Pia']);
  assert.equal(steps[1].monster, null);
  assert.deepEqual(steps.slice(2, 4).map(step => step.number), [3, 4]);
});

test('pluralized wiki wording still covers a game objective', () => {
  const steps = buildSteps({ needs: [{ type: 'mob', name: 'Green Mushroom', count: 25 }] }, [{ number: 1, title: 'Defeat 25 Green Mushrooms' }]);
  assert.equal(steps.length, 1);
});

test('the current step skips ticked steps and the accept step once accepted', () => {
  const steps = buildSteps(pia, []);
  assert.equal(currentStep(steps).step.number, 1);
  assert.equal(currentStep(steps, [], { accepted: true, giver: 'Pia' }).step.number, 2);
  assert.equal(currentStep(steps, [2, 3], { accepted: true, giver: 'Pia' }).step.title, 'Hand it in to Pia');
  assert.equal(currentStep(steps, [1, 2, 3, 4]).step, null);
});

test('an item already marked ready is not offered again as the next quest step', () => {
  const quest = { giver: 'Luke', turnIn: 'Luke', needs: [{ type: 'item', name: 'Salad', count: 1 }, { type: 'item', name: 'Stirge Wing', count: 10 }] };
  const steps = buildSteps(quest, [{ number: 1, title: 'Talk to Luke', npc: 'Luke' }]);
  assert.equal(currentStep(steps, [], { accepted: true, giver: 'Luke', completedNeeds: ['Stirge Wing'] }).step.item, 'Salad');
  assert.equal(currentStep(steps, ['need:Salad'], { accepted: true, giver: 'Luke', completedNeeds: ['Stirge Wing'] }).step.handIn, true);
});

test('a talk-only event trail goes to the map its ending text names, with the clue', () => {
  const maps = [{ id: 'pig', name: 'The Pig Beach', returnTo: 'lith' }, { id: 'hen', name: 'Henesys', town: true }, { id: 'atp', name: 'Ant Tunnel Park', returnTo: 'sleepy' }, { id: 'at1', name: 'Ant Tunnel I', returnTo: 'sleepy' }, { id: 'house', name: "Someone Else's House", returnTo: 'hen' }];
  const first = { name: 'A Trail Quest', giver: 'Jay', needs: [], text: 'The first page of the Adventurer\'s Journal is still legible.\nThe first page of the Adventurer\'s Journal reads: "Where the sea meets a shore guarded by little snouts." Only characters at Level 10 or higher can complete this quest.\nWedged in a crack in the rocks at The Pig Beach was the next sheet of the log. The Adventurer\'s Journal - Page 2 is mine.' };
  assert.deepEqual(questPlaces(first, maps), [{ id: 'pig', name: 'The Pig Beach', sentence: 'Wedged in a crack in the rocks at The Pig Beach was the next sheet of the log.' }]);
  assert.equal(questClue(first), 'Where the sea meets a shore guarded by little snouts.');
  const steps = buildSteps({ ...first, places: questPlaces(first, maps) });
  assert.deepEqual(steps.map(step => step.title), ['Talk to Jay to start', 'Go to The Pig Beach', 'Hand it in to Jay']);
  assert.equal(steps[1].mapId, 'pig'); assert.equal(steps[1].visit, true);
  const final = { giver: 'Jay', needs: [], text: 'Start.\nIt reads: "Beneath the earth, even the smallest footsteps may lead the way."\nPast the hidden portal, at the end of Ant Tunnel Park, the trail finally ran out.' };
  assert.deepEqual(questPlaces(final, maps).map(place => place.name), ['Ant Tunnel Park']);
  // No map named: the clue becomes the step, said plainly that the data has no place.
  const fourth = { giver: 'Jay', needs: [], prerequisites: ['[Event] The Third Mark'], text: 'Start.\nPage 4 reads: "Where shadows gather, leave no coin unturned."\n10 mesos was all the nameless thief ever wanted for it.' };
  assert.deepEqual(buildSteps(fourth).map(step => step.title), ['Talk to Jay to start', 'Follow the clue: "Where shadows gather, leave no coin unturned."', 'Hand it in to Jay']);
});

test('places are not added to hunting quests or deliveries to someone else', () => {
  const maps = [{ id: 'hen', name: 'Henesys' }];
  assert.deepEqual(questPlaces({ giver: 'Pia', needs: [{ type: 'mob', name: 'Snail', count: 5 }], text: 'a\nb\nDone in Henesys.' }, maps), []);
  assert.deepEqual(questPlaces({ giver: 'Pia', turnIn: 'Mai', needs: [], text: 'a\nb\nI walked to Henesys.' }, maps), []);
});

test('a town named in the ending is not a place to go (the quest NPCs are already there)', () => {
  const maps = [{ id: 'hen', name: 'Henesys', town: true }, { id: 'kc', name: 'Kerning City' }, { id: 'hall', name: 'Henesys Town Hall', town: true, returnTo: 'hen' }];
  const quest = { giver: 'Bruce', needs: [], text: 'a\nb\nI told Bruce in Henesys, then went on to Kerning City and the Henesys Town Hall.' };
  assert.deepEqual(questPlaces(quest, maps), []);
});

test('a talk-only quest lists the errands its text spells out (Trick or Treat!)', async () => {
  const { questTasks } = await import('./queststeps.js');
  const quest = { name: '[Event] Trick or Treat!', giver: 'Malady', needs: [], prerequisites: ['[Event] Halloween Candies'],
    text: "Malady says there's still one more thing left to do for Halloween...\nMalady has split her Halloween Candy into three pouches for the children spending Halloween alone. Deliver a pouch to the child in the dark tunnel, the child on the open field and the child up on the high ground. Only characters at Level 10 or higher can complete this quest.\nAll three children received their Halloween Candy." };
  assert.deepEqual(questTasks(quest), ['Deliver a pouch to the child in the dark tunnel', 'Deliver a pouch to the child on the open field', 'Deliver a pouch to the child up on the high ground']);
  // The guides name the children: real NPC steps with a route.
  const steps = buildSteps(quest);
  assert.deepEqual(steps.slice(1, 4).map(step => step.npc), ['Ronnie', 'Anne', 'Estelle']);
  assert.ok(steps.slice(1, 4).every(step => step.visit));
  assert.equal(steps.at(-1).title, 'Hand it in to Malady');
  assert.deepEqual(questTasks({ needs: [{ type: 'mob', name: 'Snail', count: 5 }], text: 'a\nDeliver it to the boss.\nc' }), []);
});

test("the Mark of the Beta trail: start from the journal page, the guides' spot, no trip back to Jay", () => {
  const steps = buildSteps({ name: '[Event] The First Mark', giver: 'Jay', turnIn: 'Jay', needs: [], prerequisites: ['[Event] The Marks We Leave Behind'], text: 'a\nb\nc' });
  assert.deepEqual(steps.map(step => step.title), ["Double-click the newest Adventurer's Journal page to read the clue and start", 'Find Page 2 at The Pig Beach']);
  assert.equal(steps[1].map, 'The Pig Beach'); assert.equal(steps[1].visit, true); assert.equal(steps[1].finishes, true);
  assert.equal(steps[0].npc, null);
  const fourth = buildSteps({ name: '[Event] The Fourth Mark', giver: 'Jay', needs: [], text: '' });
  assert.equal(fourth[1].npc, 'Mong from Kong');
});
