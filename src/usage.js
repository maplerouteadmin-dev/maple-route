// Anonymous usage counting for the public website, so the author can see whether anyone uses it.
// GoatCounter (https://www.goatcounter.com): no cookies, no personal data. Only two things are ever
// counted: "the app was opened" and "Live GPS was started". Nothing read from the game, no map names,
// quests or player information. Off on the player's own PC (localhost) and when they opt out.
//
// To turn it on: create a GoatCounter site and put its code here (https://<code>.goatcounter.com).
export const GOATCOUNTER_CODE = 'mapleroute';

const OPT_OUT_KEY = 'maple-route-no-count';
export const countingOptedOut = () => { try { return localStorage.getItem(OPT_OUT_KEY) === '1'; } catch { return false; } };
export function setCountingOptOut(off) { try { if (off) localStorage.setItem(OPT_OUT_KEY, '1'); else localStorage.removeItem(OPT_OUT_KEY); } catch { /* storage blocked */ } }

// Whether counting may run here: a code is set, not this PC, not opted out.
export const countingEnabled = ({ code = GOATCOUNTER_CODE, local = false, optedOut = false } = {}) => Boolean(code) && !local && !optedOut;

let ready = null;
export function startCounting({ local }) {
  if (!countingEnabled({ local, optedOut: countingOptedOut() })) return;
  window.goatcounter = { no_onload: true, allow_local: false };
  ready = new Promise(resolve => {
    const script = document.createElement('script');
    script.async = true; script.src = 'https://gc.zgo.at/count.js';
    script.dataset.goatcounter = `https://${GOATCOUNTER_CODE}.goatcounter.com/count`;
    script.onload = resolve; script.onerror = () => resolve();
    document.head.append(script);
  });
  countEvent('app-opened');
}

// One of the two counted events. Path names only; never anything from the game.
export function countEvent(name) {
  if (!ready || countingOptedOut()) return;
  ready.then(() => { try { window.goatcounter?.count?.({ path: name, title: name, event: true }); } catch { /* blocked */ } });
}
