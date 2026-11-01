// "The game is gone": neither the mini map nor the HP/MP/EXP bars have been seen for a while while
// Live GPS reads (login screen after a disconnect, the game closed). A loading screen or the cash shop
// can hide both briefly, so the alert waits 90 seconds. Pure.
export const GONE_AFTER_MS = 90_000;
export function gameGone({ minimapSeenAt = null, barsSeenAt = null, startedAt = null, now = Date.now() }) {
  const last = Math.max(minimapSeenAt ?? 0, barsSeenAt ?? 0, startedAt ?? 0);
  return Boolean(last) && now - last >= GONE_AFTER_MS;
}
