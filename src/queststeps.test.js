import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSteps, currentStep } from './queststeps.js';

const pia = { name: 'Pia and the Blue Mushroom', giver: 'Pia', turnIn: 'Pia', needs: [{ type: 'mob', name: 'Blue Mushroom', count: 20 }, { type: 'item', name: 'Blue Mushroom Cap', count: 10 }] };

test('steps come from the game data when the wiki has none', () => {
  const steps = buildSteps(pia, []);
  assert.deepEqual(steps.map(s => s.title), ['Talk to Pia to start', 'Defeat 20 Blue Mushroom', 'Collect 10 Blue Mushroom Cap', 'Hand it in to Pia']);
  assert.equal(steps[1].monster, 'Blue Mushroom'); assert.equal(steps[3].npc, 'Pia');
});

test('the wiki step list wins when it exists', () => {
  const steps = buildSteps(pia, [{ number: 1, title: 'Talk to Pia', npc: 'Pia' }, { number: 2, title: 'Collect caps', monster: '' }]);
  assert.equal(steps.length, 2); assert.equal(steps[1].monster, null);
});

test('the current step skips ticked steps and the accept step once accepted', () => {
  const steps = buildSteps(pia, []);
  assert.equal(currentStep(steps).step.number, 1);
  assert.equal(currentStep(steps, [], { accepted: true, giver: 'Pia' }).step.number, 2);
  assert.equal(currentStep(steps, [2, 3], { accepted: true, giver: 'Pia' }).step.title, 'Hand it in to Pia');
  assert.equal(currentStep(steps, [1, 2, 3, 4]).step, null);
});
