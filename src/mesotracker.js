// Mesos per hour from pickup lines in the visible chat ("You have gained mesos (+1,250)").
// Chat lines stay on screen across reads, so only lines below what was seen last time count.
// Untested: the exact Classic wording is matched loosely (gained / picked up … mesos … number).
export function mesoAmount(line) {
  const text = String(line ?? '');
  if (!/meso/i.test(text) || !/gain|pick|obtain|\+/i.test(text)) return 0;
  const match = text.match(/\+\s?([\d][\d,.]{0,12})/) ?? text.match(/([\d][\d,.]{0,12})\s*meso/i) ?? text.match(/meso\w*\D{0,6}([\d][\d,.]{0,12})/i);
  const value = match ? Number(match[1].replace(/[,.]/g, '')) : 0;
  return Number.isFinite(value) && value > 0 && value < 100_000_000 ? value : 0;
}
// The chat as lines; returns the lines that are new since `previous` (the last read's lines): the
// longest end of `previous` that starts `lines` is the overlap.
export function newChatLines(previous = [], lines = []) {
  const clean = lines.map(line => line.trim()).filter(Boolean);
  if (!previous.length) return { fresh: [], lines: clean }; // first read: what is there already is old
  for (let overlap = Math.min(previous.length, clean.length); overlap > 0; overlap--) {
    const tail = previous.slice(previous.length - overlap);
    if (tail.every((line, i) => line === clean[i])) return { fresh: clean.slice(overlap), lines: clean };
  }
  return { fresh: clean, lines: clean };
}
export function createMesoTracker(now = Date.now()) { return { startedAt: now, mesos: 0, pickups: 0, lastAt: null }; }
export function addMesos(tracker, amounts, now = Date.now()) {
  const sum = amounts.reduce((a, b) => a + b, 0);
  return sum > 0 ? { ...tracker, mesos: tracker.mesos + sum, pickups: tracker.pickups + amounts.filter(a => a > 0).length, lastAt: now } : tracker;
}
export function mesosPerHour(tracker, now = Date.now()) {
  const hours = (now - tracker.startedAt) / 3_600_000;
  return hours >= 1 / 30 && tracker.pickups ? Math.round(tracker.mesos / hours) : null; // after 2 minutes
}
