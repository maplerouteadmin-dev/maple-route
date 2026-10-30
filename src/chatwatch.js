// Read-only matching of OCR text from the visible in-game chat. No network or
// persistence here: only the caller's in-memory session sees matched lines.
export function watchKeywords(input) {
  return [...new Set(String(input ?? '').split(/[,\n]/).map(word => word.trim().replace(/\s+/g, ' ').toLowerCase()).filter(word => word.length >= 2 && word.length <= 40))].slice(0, 10);
}

export function parseWatchedChatLine(line) {
  const text = String(line ?? '').trim().replace(/^[^\p{L}\p{N}]+/u, '');
  // Require a name and a chat separator. System notices and wrapped text must
  // not be misattributed to the first word in the line.
  const match = /^([\p{L}\p{N}_]{2,16})(?:\s+(?:\[[^\]]{1,24}\]|(?:CH|Channel)\s*\d{1,2}))*\s*[:：]\s*(.{2,240})$/iu.exec(text);
  if (!match) return null;
  if (/^(?:system|notice|maplestory|server|quest|event)$/i.test(match[1])) return null;
  const message = match[2].trim().replace(/\s+/g, ' ');
  return message ? { username: match[1], message } : null;
}

export function isShopAdvert(message) {
  const text = String(message ?? '').trim().replace(/^(?:\[[^\]]{1,32}\]\s*)+/u, '');
  return /^(?:[SB5]\s*[>»›]|WTS\b|WTB\b|selling\b|buying\b|buy\s*>|sell\s*>)/iu.test(text)
    || /(?:^|\s)[SB5]\s*[>»›]/iu.test(text);
}

function containsKeyword(message, keyword) {
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}($|[^\\p{L}\\p{N}])`, 'iu').test(message);
}

export function createChatWatch() {
  const seen = new Map();
  let primed = false;
  return {
    reset() { seen.clear(); primed = false; },
    scan(text, input, now = Date.now(), { ignoreShopAds = false } = {}) {
      const words = watchKeywords(input);
      if (!words.length) return [];
      for (const [key, at] of seen) if (now - at > 5 * 60_000) seen.delete(key);
      const matches = [];
      for (const line of String(text ?? '').split(/\r?\n/)) {
        const parsed = parseWatchedChatLine(line);
        if (!parsed) continue;
        const key = `${parsed.username.toLowerCase()}:${parsed.message.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '')}`;
        if (seen.has(key)) continue;
        seen.set(key, now);
        const keyword = words.find(word => containsKeyword(parsed.message, word));
        if (primed && keyword && !(ignoreShopAds && isShopAdvert(parsed.message)) && matches.length < 3) matches.push({ ...parsed, keyword });
      }
      while (seen.size > 120) seen.delete(seen.keys().next().value);
      primed = true; // Existing lines on startup are context, not new notifications.
      return matches;
    }
  };
}
