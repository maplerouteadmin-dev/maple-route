import test from 'node:test';
import assert from 'node:assert/strict';
import { createChatWatch, isShopAdvert, parseWatchedChatLine, watchKeywords } from './chatwatch.js';

test('keywords are bounded and distinct', () => {
  assert.deepEqual(watchKeywords(' scroll, ILBI,scroll, a, blue snail '), ['scroll', 'ilbi', 'blue snail']);
});

test('visible player chat is parsed, but notices and wrapped lines are not attributed', () => {
  assert.deepEqual(parseWatchedChatLine('MapleMage [CH 2] : Selling an Ilbi'), { username: 'MapleMage', message: 'Selling an Ilbi' });
  assert.deepEqual(parseWatchedChatLine('MapleMage: Looking for a party'), { username: 'MapleMage', message: 'Looking for a party' });
  assert.equal(parseWatchedChatLine('Welcome to MapleStory'), null);
  assert.equal(parseWatchedChatLine('System: A server event is starting'), null);
  assert.equal(parseWatchedChatLine('Long line continued here'), null);
});

test('old visible lines prime the watch, new matching lines notify once', () => {
  const watch = createChatWatch();
  assert.deepEqual(watch.scan('PlayerOne: selling ilbi', 'ilbi', 1000), []);
  assert.deepEqual(watch.scan('PlayerOne: selling ilbi\nPlayerTwo: I found Ilbi!', 'ilbi', 2000), [{ username: 'PlayerTwo', message: 'I found Ilbi!', keyword: 'ilbi' }]);
  assert.deepEqual(watch.scan('PlayerTwo: I found Ilbi!', 'ilbi', 3000), []);
  assert.deepEqual(watch.scan('PlayerThree: maple syrup', 'map', 4000), []); // whole word only
  watch.reset();
  assert.deepEqual(watch.scan('PlayerTwo: I found Ilbi!', 'ilbi', 5000), []);
});

test('ignore-shop option skips B>/S> ads without hiding ordinary keyword chat', () => {
  assert.equal(isShopAdvert('B>Claw ATT 60%, leave offer ty'), true);
  assert.equal(isShopAdvert('[Yellow Square] S> Claw ATT 60%'), true);
  assert.equal(isShopAdvert('WTB Claw scroll'), true);
  assert.equal(isShopAdvert('Did you see the Claw ATT scroll?'), false);
  const watch = createChatWatch();
  watch.scan('PlayerOne: hello', 'claw', 1000, { ignoreShopAds: true });
  assert.deepEqual(watch.scan('Trader: B>Claw ATT 60%, leave offer ty\nFriend: Found a Claw ATT scroll', 'claw', 2000, { ignoreShopAds: true }), [
    { username: 'Friend', message: 'Found a Claw ATT scroll', keyword: 'claw' }
  ]);
  assert.deepEqual(watch.scan('Trader: B>Claw ATT 60%, leave offer ty', 'claw', 3000), []); // filtered old lines do not pop up later
  watch.reset(); watch.scan('PlayerOne: hello', 'claw', 4000);
  assert.deepEqual(watch.scan('Trader: B>Claw ATT 60%, leave offer ty', 'claw', 5000), [
    { username: 'Trader', message: 'B>Claw ATT 60%, leave offer ty', keyword: 'claw' }
  ]);
});
