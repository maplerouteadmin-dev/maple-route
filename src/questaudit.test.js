import test from 'node:test';
import assert from 'node:assert/strict';
import { auditQuestCatalog } from './questaudit.js';

test('catalog audit finds missing wiki steps and confirms reconciliation covers requirements', () => {
  const quests = [{ name: 'Luke the Security Guy', giver: 'Luke', turnIn: 'Luke', needs: [{ name: 'Salad', type: 'item', count: 1 }] }];
  const report = auditQuestCatalog(quests, [{ quest: 'Luke the Security Guy', item: 'Salad', quantity: 1 }],
    [{ quest: 'Luke the Security Guy', title: 'Talk to Luke', npc: 'Luke' }]);
  assert.equal(report.unnamedInStepsQuests, 1);
  assert.equal(report.uncoveredAfterReconcileQuests, 0);
  assert.deepEqual(report.rows[0].unnamedInSteps, ['Salad']);
});

test('catalog audit flags any supplied item still mislabeled as a farming need', () => {
  const report = auditQuestCatalog([{ name: 'Delivery', startItems: [{ name: 'Letter' }], needs: [{ name: 'Letter', type: 'item', count: 1 }] }], [], []);
  assert.equal(report.suppliedItemQuests, 1);
  assert.deepEqual(report.suppliedItemsStillInNeeds, ['Delivery: Letter']);
});
