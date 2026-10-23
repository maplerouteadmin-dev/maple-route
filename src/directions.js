import { portalPosition } from './core.js';
import { fareText } from './transport.js';

const findMap = (data, id) => data.maps.find(map => map.id === id);

function sideOf(map, point) {
  const bounds = map?.bounds;
  if (!bounds || !Number.isFinite(point?.x) || bounds.maxX - bounds.minX < 300) return null;
  const fraction = (point.x - bounds.minX) / (bounds.maxX - bounds.minX);
  return fraction < .34 ? 'left' : fraction > .66 ? 'right' : 'middle';
}

// One route step in plain words: what to do, how this kind of exit works, and where you will
// land on the next map relative to the exit after it.
export function describeStep(data, step, next = null, { level = null } = {}) {
  const from = findMap(data, step.from), to = findMap(data, step.to);
  const toName = to?.name ?? 'the next map';
  const place = portalPosition(step, from);
  const at = place ? `${place} ` : '';
  let headline, how;
  switch (step.kind) {
    case 'taxi':
      headline = /cab$/i.test(step.npc ?? 'Cab') ? `Take the ${step.npc ?? 'Regular Cab'} to ${toName}` : `Ride with ${step.npc} to ${toName}`;
      how = `Talk to ${step.npc ?? 'the taxi driver'}${place ? ` (${place} side of town)` : ''}. ${fareText(step.fare, level)}`;
      break;
    case 'scroll':
      headline = `Use a ${step.name ?? 'Return Scroll - Nearest Town'} to go to ${toName}`;
      how = 'Use it from the Use tab of your inventory.';
      break;
    case 'walk':
      headline = `Walk through the ${at}exit to ${toName}`;
      how = 'This exit triggers when you walk into it.';
      break;
    case 'hidden':
      headline = `Find the hidden ${at}portal to ${toName}`;
      how = 'There is no swirl on screen. Stand at the spot and press ↑. It may need a quest first.';
      break;
    case 'special':
      headline = `Use the special ${at}exit to ${toName}`;
      how = 'Scripted exit. It may need a quest, item or NPC first.';
      break;
    default:
      headline = `Take the ${at}portal to ${toName}`;
      how = 'Stand on the swirl and press ↑.';
  }
  let arrival = null;
  const landing = step.arrive && to?.spots?.[step.arrive];
  if (landing && next && next.from === step.to && next.kind !== 'taxi') {
    const landSide = sideOf(to, landing), dx = Number(next.x) - landing.x;
    if (landSide && Number.isFinite(dx)) {
      const way = Math.abs(dx) < 200 ? 'close by' : dx > 0 ? 'to your right' : 'to your left';
      arrival = `You arrive on the ${landSide === 'middle' ? 'middle' : `${landSide} side`} of ${toName}; the next exit is ${way}.`;
    }
  }
  return { headline, how, arrival };
}

export function spokenStep(data, step, next = null, options = {}) {
  const { headline } = describeStep(data, step, next, options);
  return `${headline}.`;
}
