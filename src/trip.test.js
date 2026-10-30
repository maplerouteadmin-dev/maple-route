import test from 'node:test';
import assert from 'node:assert/strict';
import { pendingQuestTasks, planQuestTrip } from './trip.js';

const data = {
  maps: [{ id: 'a', name: 'Town' }, { id: 'b', name: 'Forest' }, { id: 'c', name: 'Cave' }],
  portals: [{ from: 'a', to: 'b', name: 'east', cost: 1 }, { from: 'b', to: 'c', name: 'east', cost: 1 }],
  targets: [
    { id: 'npc:1', kind: 'npc', name: 'Mai', locations: [{ mapId: 'a' }] },
    { id: 'mob:1', kind: 'mob', name: 'Shroom', locations: [{ mapId: 'b', count: 10 }] },
    { id: 'mob:2', kind: 'mob', name: 'Blue Snail', locations: [{ mapId: 'b', count: 8 }] }
  ]
};

test('multi-quest planner groups current steps on the same map', () => {
  const catalog = [{ name: 'One' }, { name: 'Two' }];
  const details = {
    One: { status: 'loaded', steps: [{ number: 1, title: 'Defeat Shrooms', monster: 'Shroom' }] },
    Two: { status: 'loaded', steps: [{ number: 1, title: 'Defeat Blue Snails', monster: 'Blue Snail' }] }
  };
  const tasks = pendingQuestTasks(data, ['One', 'Two'], catalog, details, {}, 'a');
  const plan = planQuestTrip(data, tasks, 'a');
  assert.equal(plan.stops.length, 1);
  assert.equal(plan.stops[0].map.name, 'Forest');
  assert.equal(plan.stops[0].hops, 1);
  assert.equal(plan.stops[0].tasks.length, 2);
});

test('checking a quest step reveals its next stage without advancing other quests', () => {
  const details = {
    One: { status: 'loaded', steps: [{ number: 1, title: 'Talk', npc: 'Mai' }, { number: 2, title: 'Hunt', monster: 'Shroom' }] },
    Two: { status: 'loaded', steps: [{ number: 1, title: 'Blue Snails', monster: 'Blue Snail' }] }
  };
  const tasks = pendingQuestTasks(data, ['One', 'Two'], [], details, { One: [1] }, 'a');
  assert.equal(tasks[0].step.title, 'Hunt');
  assert.equal(tasks[1].step.title, 'Blue Snails');
});

test('adding a quest to a trip does not skip its first conversation until accepted', () => {
  const catalog = [{ name: 'One', giver: 'Mai' }];
  const details = { One: { status: 'loaded', steps: [{ number: 1, title: 'Talk to Mai', npc: 'Mai' }, { number: 2, title: 'Hunt Shrooms', monster: 'Shroom' }] } };
  const planned = pendingQuestTasks(data, ['One'], catalog, details, {}, 'a', {}, []);
  const inProgress = pendingQuestTasks(data, ['One'], catalog, details, {}, 'a', {}, ['One']);
  assert.equal(planned[0].step.title, 'Talk to Mai');
  assert.equal(inProgress[0].step.title, 'Hunt Shrooms');
});

test('unreachable and unmapped steps are disclosed, not given a fake route', () => {
  const tasks = [
    { quest: { name: 'Return' }, step: { title: 'Talk' }, status: 'loaded', maps: [{ map: data.maps[0], spawns: 0 }] },
    { quest: { name: 'Collect' }, step: { title: 'Collect ore' }, status: 'loaded', maps: [] }
  ];
  const plan = planQuestTrip(data, tasks, 'c');
  assert.equal(plan.stops.length, 0);
  assert.equal(plan.unroutable.length, 1);
  assert.equal(plan.unmapped.length, 1);
});

test('trip warnings do not ask players to find items supplied when the quest starts', () => {
  const catalog = [{ name: 'Delivery', giver: 'Mai', turnIn: 'Mai', startItems: [{ name: 'Letter' }], needs: [] }];
  const details = { Delivery: { status: 'loaded', steps: [{ number: 1, title: 'Talk to Mai', npc: 'Mai' }], items: [{ name: 'Letter', quantity: 1 }] } };
  const [task] = pendingQuestTasks(data, ['Delivery'], catalog, details, {}, 'a');
  assert.deepEqual(task.items, []);
});
