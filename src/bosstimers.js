// Boss respawn timers: the player presses "Killed it" and a countdown runs. Respawn times are not in
// any game data we have, so every boss starts at an hour and the player sets their own (it is kept).
export const BOSSES = ['Mano', 'Stumpy', 'Faust', 'King Clang', 'Mushmom', 'Zombie Mushmom', 'Jr. Balrog', 'Crimson Balrog'];
export const DEFAULT_RESPAWN_MIN = 60;

// timers: { [boss]: { killedAt, minutes } }. Returns rows for every boss with a timer, soonest first.
export function bossRows(timers = {}, now = Date.now()) {
  return Object.entries(timers)
    .filter(([name, t]) => BOSSES.includes(name) && Number.isFinite(t?.killedAt))
    .map(([name, t]) => {
      const minutes = respawnMinutes(t.minutes), dueAt = t.killedAt + minutes * 60_000;
      return { name, minutes, killedAt: t.killedAt, dueAt, left: dueAt - now, due: now >= dueAt };
    })
    .sort((a, b) => a.dueAt - b.dueAt);
}
export const respawnMinutes = value => Number.isFinite(Number(value)) && Number(value) >= 1 && Number(value) <= 24 * 60 ? Math.round(Number(value)) : DEFAULT_RESPAWN_MIN;

// "12:05" or "1:02:05" left, "due" once it is time.
export function countdown(ms) {
  if (ms <= 0) return 'due';
  const s = Math.ceil(ms / 1000), h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), sec = s % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`;
}

// Which bosses to announce now: a minute before, and when due. `said` remembers what was said.
export function bossAnnouncements(rows, said = {}) {
  const out = [];
  for (const row of rows) {
    const key = `${row.name}@${row.killedAt}`;
    if (row.due && said[key] !== 'due') out.push({ key, stage: 'due', words: `${row.name} should be back now.` });
    else if (!row.due && row.left <= 60_000 && !said[key]) out.push({ key, stage: 'soon', words: `${row.name} is due in a minute.` });
  }
  return out;
}
