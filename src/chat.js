// Room identity and client-side filtering are independent of the game and the network.
export const CHAT_KINDS = ['here', 'map', 'channel', 'world'];

export function chatRoom(kind, world, channel, mapId) {
  const name = String(world ?? '').trim().replace(/\s+/g, ' ');
  const ch = Number(channel);
  const map = String(mapId ?? '').trim();
  if (!CHAT_KINDS.includes(kind) || !/^[A-Za-z0-9 -]{2,30}$/.test(name)) return null;
  if (['here', 'channel'].includes(kind) && (!Number.isInteger(ch) || ch < 1 || ch > 40)) return null;
  if (['here', 'map'].includes(kind) && !/^\d{1,12}$/.test(map)) return null;
  return { kind, world: name.toLowerCase(), channel: ['here', 'channel'].includes(kind) ? ch : null, mapId: ['here', 'map'].includes(kind) ? map : null };
}

export function roomKey(room) {
  return room ? `${room.kind}:${room.world}:${room.channel ?? ''}:${room.mapId ?? ''}` : '';
}

export function chatMessage(text) {
  const body = String(text ?? '').trim().replace(/\s+/g, ' ');
  if (!body || body.length > 280 || /https?:\/\/|www\.|discord\.gg\//i.test(body)) return null;
  return body;
}

export function visibleMessages(messages, { blocked = [], hiddenIds = [], mutedWords = [], hideRepeats = true } = {}) {
  const blockedSet = new Set(blocked);
  const hiddenSet = new Set(hiddenIds);
  const words = mutedWords.map(word => word.toLowerCase().trim()).filter(Boolean);
  const seen = new Map();
  return messages.filter(message => {
    if (hiddenSet.has(message.id) || blockedSet.has(message.owner) || words.some(word => message.body.toLowerCase().includes(word))) return false;
    const key = `${message.owner}:${message.body.toLowerCase()}`;
    const time = Date.parse(message.created_at);
    const previous = seen.get(key);
    seen.set(key, time);
    return !hideRepeats || !Number.isFinite(previous) || !Number.isFinite(time) || time - previous > 60_000;
  });
}

export function travelerName(owner) {
  return `Traveler ${String(owner ?? '').replace(/-/g, '').slice(0, 6).toUpperCase() || '??????'}`;
}
