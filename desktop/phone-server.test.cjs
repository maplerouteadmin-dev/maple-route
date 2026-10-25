const test = require('node:test');
const assert = require('node:assert/strict');
const { privateIpv4, lanAddress, tokenMatches, safeAction } = require('./phone-server.cjs');

test('LAN binding accepts only private IPv4', () => {
  assert.equal(privateIpv4('192.168.1.50'), true);
  assert.equal(privateIpv4('172.31.2.4'), true);
  assert.equal(privateIpv4('192.168.1.4'), true);
  assert.equal(privateIpv4('127.0.0.1'), false);
  assert.equal(privateIpv4('8.8.8.8'), false);
  assert.equal(lanAddress({ wifi: [{ family: 'IPv4', internal: false, address: '192.168.1.50' }] }), '192.168.1.50');
});
test('session token and remote UI action validation', () => {
  assert.equal(tokenMatches('abcdef', 'abcdef'), true);
  assert.equal(tokenMatches('abc', 'abcdef'), false);
  assert.equal(safeAction({ kind: 'click', path: [0, 2], tag: 'BUTTON' }), true);
  assert.equal(safeAction({ kind: 'click', path: [0, -1], tag: 'BUTTON' }), false);
  assert.equal(safeAction({ kind: 'script', path: [0], tag: 'BUTTON' }), false);
});

test('the phone link uses the Wi-Fi address, not a dock or VPN point-to-point address', () => {
  const { lanAddress } = require('./phone-server.cjs');
  const interfaces = {
    DataDock: [{ family: 'IPv4', address: '10.200.0.2', netmask: '255.255.255.255', internal: false }],
    tailscale0: [{ family: 'IPv4', address: '100.64.0.7', netmask: '255.255.255.255', internal: false }],
    wlan0: [{ family: 'IPv4', address: '192.168.1.50', netmask: '255.255.255.0', internal: false }]
  };
  assert.equal(lanAddress(interfaces), '192.168.1.50');
});

