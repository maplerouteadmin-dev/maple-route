const test = require('node:test');
const assert = require('node:assert/strict');
const { findGamescopeNode, parseFrames } = require('./deck-stream.cjs');

test('finds only the gamescope video source', () => {
  assert.equal(findGamescopeNode([{ id: 7, type: 'PipeWire:Interface:Node', info: { props: { 'node.name': 'gamescope', 'media.class': 'Video/Source' } } }]), 7);
  assert.equal(findGamescopeNode([{ id: 7, type: 'PipeWire:Interface:Node', info: { props: { 'node.name': 'gamescope', 'media.class': 'Audio/Source' } } }]), null);
});
test('parses split frames and rejects impossible sizes', () => {
  const frames = [];
  const feed = parseFrames(frame => frames.push(frame));
  const bytes = Buffer.alloc(20); bytes.writeUInt32LE(8, 0); bytes.writeUInt32LE(2, 4); bytes.writeUInt32LE(1, 8); bytes.fill(42, 12);
  feed(bytes.subarray(0, 9)); feed(bytes.subarray(9));
  assert.equal(frames.length, 1);
  assert.equal(frames[0].pixels.length, 8);
  assert.throws(() => feed(Buffer.alloc(12)), /Invalid capture/);
});
