import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSteps, currentStep } from './queststeps.js';

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
