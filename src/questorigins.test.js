import test from 'node:test';
import assert from 'node:assert/strict';
import { questItemGivenAtStart, verifiedQuestItemMonsters, verifiedQuestTurnIn } from './questorigins.js';

test('The Old Snail supplies its book when Pia starts the quest', () => {
  assert.deepEqual(questItemGivenAtStart({ name: 'The Old Snail' }, 'The Snail Legend'), { npc: 'Pia', map: 'Henesys Park' });
  assert.equal(questItemGivenAtStart('Snail Hunt', 'The Snail Legend'), null);
  assert.equal(questItemGivenAtStart('The Old Snail', 'Snail Shell'), null);
});

test('game-provided starter items take precedence over a guessed monster', () => {
  const quest = { name: 'Transporting Drake\'s Skull', giver: 'Anne', start: 'The Hill East of Henesys', startItems: [{ name: 'Stuffed Drake Skull', count: 1 }] };
  assert.deepEqual(questItemGivenAtStart(quest, 'Stuffed Drake Skull'), { npc: 'Anne', map: 'The Hill East of Henesys' });
  assert.equal(questItemGivenAtStart(quest, 'Drake Skull'), null);
});

test('Mano is the verified source of the rainbow shell', () => {
  assert.deepEqual(verifiedQuestItemMonsters({ name: 'A rainbow snail shell that makes wishes come true!?' }, 'Rainbow-colored Snail Shell'), ['Mano']);
  assert.equal(verifiedQuestItemMonsters({ name: 'Snail Hunt' }, 'Rainbow-colored Snail Shell'), null);
});

test('the verified hand-in NPCs do not depend on the wiki being online', () => {
  assert.equal(verifiedQuestTurnIn('The Old Snail'), 'Jay');
  assert.equal(verifiedQuestTurnIn('First Greeting with Nella, the Town Resident'), 'Nella');
  assert.equal(verifiedQuestTurnIn('Snail Hunt'), null);
});
