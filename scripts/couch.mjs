// Opt-in bridge between the loopback PC app and the existing token-protected phone page.
// Only derived app UI is mirrored. Game frames never enter this server.
export function createCouchHost({ localOrigin, startPhoneServer }) {
  let phone = null;
  const actions = [];
  const status = () => phone ? { enabled: true, url: phone.url, qr: phone.qr, connectedPhones: phone.clients.size } : { enabled: false, connectedPhones: 0 };
  return {
    status,
    async enable() {
      if (phone) return status();
      phone = await startPhoneServer({
        localOrigin, mode: 'couch',
        onAction: action => { if (actions.length < 100) actions.push(action); },
        onStart: () => {}, // Browser capture needs a gesture on the PC, never a remote request.
        onStop: () => { if (actions.length < 100) actions.push({ kind: 'command', command: 'stop' }); },
        onOverlay: () => {} // Document PiP also needs a local PC gesture.
      });
      return status();
    },
    async disable() {
      const old = phone; phone = null; actions.length = 0;
      if (!old) return status();
      for (const client of old.clients) client.end();
      await new Promise(resolve => old.server.close(resolve));
      return status();
    },
    publish(snapshot) {
      if (!phone || typeof snapshot?.html !== 'string' || snapshot.html.length > 2_000_000 || typeof snapshot.bodyClass !== 'string') return false;
      phone.publish({ html: snapshot.html, bodyClass: snapshot.bodyClass.slice(0, 200), status: snapshot.status?.state === 'reading' ? { state: 'reading' } : { state: 'off' } });
      return true;
    },
    drain() { return actions.splice(0, 50); }
  };
}
