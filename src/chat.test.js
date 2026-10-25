import test from 'node:test';
import assert from 'node:assert/strict';
import { chatRoom, roomKey, chatMessage, visibleMessages, travelerName } from './chat.js';

test('rooms never guess a world or channel and follow only valid map ids', () => {
  assert.deepEqual(chatRoom('here', ' Scania ', '3', '100000000'), { kind: 'here', world: 'scania', channel: 3, mapId: '100000000' });
  assert.deepEqual(chatRoom('map', 'Scania', '', '100000000'), { kind: 'map', world: 'scania', channel: null, mapId: '100000000' });
  assert.deepEqual(chatRoom('world', 'Scania'), { kind: 'world', world: 'scania', channel: null, mapId: null });
  assert.equal(chatRoom('here', 'Scania', '', '100000000'), null);
  assert.equal(chatRoom('map', 'Scania', 1, 'not-a-map'), null);
  assert.equal(chatRoom('world', '<script>'), null);
  assert.equal(roomKey(chatRoom('channel', 'Scania', 3)), 'channel:scania:3:');
});

test('messages are short plain text without links', () => {
  assert.equal(chatMessage('  Party at   Henesys? '), 'Party at Henesys?');
  assert.equal(chatMessage('see https://example.com'), null);
  assert.equal(chatMessage('x'.repeat(281)), null);
});

test('blocks, muted words and duplicate filtering work locally', () => {
  const messages = [
    { owner: 'a', body: 'Looking for party', created_at: '2026-01-01T00:00:00Z' },
    { owner: 'a', body: 'Looking for party', created_at: '2026-01-01T00:00:10Z' },
    { owner: 'b', body: 'Free mesos', created_at: '2026-01-01T00:00:11Z' },
    { owner: 'c', body: 'Hello', created_at: '2026-01-01T00:00:12Z' }
  ];
  assert.deepEqual(visibleMessages(messages, { blocked: ['c'], mutedWords: ['MESOS'] }).map(m => m.body), ['Looking for party']);
  assert.equal(travelerName('abc-def'), 'Traveler ABCDEF');
});
