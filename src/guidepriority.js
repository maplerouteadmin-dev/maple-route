// The visible quest plan and GPS destination must come from the same stop.
// In combined mode, a stale individual guide is never allowed to pick its own NPC.
export function firstGuideStop(plan) {
  const stop = plan?.trip?.order?.[0];
  if (!stop?.mapId) return null;
  const npc = stop.type === 'buy' || stop.type === 'start' ? stop.npc
    : stop.type === 'handin' ? plan.ends?.get(stop.mapId)?.[0]
      : null;
  return { stop, mapId: stop.mapId, npc: npc ?? null };
}
