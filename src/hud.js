import { normalize, editDistance } from './core.js';

// Pure readers for the rest of the game HUD in one captured frame: the HP/MP/EXP status bars, the
// Quest Helper panel and the chat input bar. Images are ImageData-like ({ width, height, data }),
// colours were sampled from Classic World screenshots (see fixtures/screens).

const at = (image, x, y) => { const i = (y * image.width + x) * 4; return [image.data[i], image.data[i + 1], image.data[i + 2]]; };
const isHpRed = (r, g, b) => r > 150 && g < 80 && b < 80;
const isMpBlue = (r, g, b) => b > 160 && r < 90 && g > 60 && g < 180;
const isExpLime = (r, g, b) => g > 140 && b < 100 && r > 60;
const isTrack = (r, g, b) => { const max = Math.max(r, g, b); return max - Math.min(r, g, b) < 22 && max >= 120 && max <= 215; };
const isHelperBody = (r, g, b) => r >= 95 && r <= 135 && g >= 135 && g <= 172 && b >= 195 && b <= 238 && b - r > 65;
const isInputWhite = (r, g, b) => Math.min(r, g, b) > 235;

function classify(r, g, b) {
  if (isHpRed(r, g, b)) return 'R';
  if (isMpBlue(r, g, b)) return 'B';
  if (isExpLime(r, g, b)) return 'G';
  if (isTrack(r, g, b)) return 'N';
  return null;
}

function rowSegments(image, y) {
  const segments = [];
  for (let x = 0; x < image.width; x++) {
    const kind = classify(...at(image, x, y));
    if (!kind) continue;
    const last = segments[segments.length - 1];
    if (last && last.kind === kind && x - last.end <= 3) last.end = x;
    else segments.push({ kind, start: x, end: x });
  }
  return segments;
}

// A bar = its colour run plus the grey empty track right after it. The track is followed pixel by
// pixel and stops where its brightness changes (the bar's lighter border, the dark panel).
function barAt(image, y, segments, index, kind) {
  const fill = segments[index];
  if (!fill || fill.kind !== kind) return null;
  let x = fill.end + 1, end = fill.end, reference = null, skipped = 0;
  while (x < image.width) {
    const [r, g, b] = at(image, x, y), max = Math.max(r, g, b);
    if (isTrack(r, g, b) && (reference === null || Math.abs(max - reference) <= 15)) { reference ??= max; end = x; x++; continue; }
    if (reference === null && skipped < 2) { skipped++; x++; continue; } // anti-aliased edge between fill and track
    break;
  }
  const next = segments.findIndex((s, k) => k > index && s.start > end);
  return { x0: fill.start, fillEnd: fill.end, x1: end, next: next < 0 ? segments.length : next };
}

// Finds the red-blue-green bar trio at the bottom of the screen (never the red Cash Shop or blue Menu
// buttons: those are not a side-by-side trio of similar length).
export function findStatusBars(image, { offsetY = 0, offsetX = 0 } = {}) {
  const { width, height } = image, rows = [];
  const gap = Math.max(8, width * .015);
  for (let y = 0; y < height; y++) {
    const segments = rowSegments(image, y);
    for (let i = 0; i < segments.length; i++) {
      const hp = barAt(image, y, segments, i, 'R'); if (!hp) continue;
      const j = segments.findIndex((s, k) => k >= hp.next && s.kind === 'B'); if (j < 0 || segments[j].start - hp.x1 > gap) continue;
      const mp = barAt(image, y, segments, j, 'B');
      const k = segments.findIndex((s, n) => n >= mp.next && s.kind === 'G'); if (k < 0 || segments[k].start - mp.x1 > gap) continue;
      const exp = barAt(image, y, segments, k, 'G');
      const hpLen = hp.x1 - hp.x0, mpLen = mp.x1 - mp.x0, expLen = exp.x1 - exp.x0;
      if (hpLen < width * .04 || Math.abs(hpLen - mpLen) > Math.max(hpLen, mpLen) * .2 || expLen < hpLen * .5 || expLen > hpLen * 1.6) continue;
      rows.push({ y, hp, mp, exp });
      break;
    }
  }
  if (!rows.length) return null;
  // Longest run of consecutive rows agreeing on the bar start.
  let best = [], run = [];
  for (const row of rows) {
    if (run.length && (row.y !== run[run.length - 1].y + 1 || Math.abs(row.hp.x0 - run[0].hp.x0) > 3)) run = [];
    run.push(row); if (run.length > best.length) best = run;
  }
  if (best.length < 3) return null;
  const middle = best[Math.floor(best.length / 2)];
  const bar = b => ({ x0: b.x0 + offsetX, x1: b.x1 + offsetX, fill: (b.fillEnd - b.x0 + 1) / (b.x1 - b.x0 + 1), fillLength: b.fillEnd - b.x0 + 1, length: b.x1 - b.x0 + 1 });
  return { y0: best[0].y + offsetY, y1: best[best.length - 1].y + offsetY, hp: bar(middle.hp), mp: bar(middle.mp), exp: bar(middle.exp) };
}

// Text row above the bars ("HP [558/558]  MP [448/448]  EXP 5,381 [76.33%]") and the level digits
// to the left, sized from the HP bar length so any resolution works (calibrated at 2000 px wide).
export function statusTextRect(bars) {
  const L = bars.hp.length;
  return { x: Math.max(0, bars.hp.x0 - Math.round(L * .03)), y: Math.max(0, bars.y0 - Math.round(L * .17)), w: bars.exp.x1 - bars.hp.x0 + Math.round(L * .12), h: Math.round(L * .12) };
}

export function levelRect(bars) {
  const L = bars.hp.length;
  return { x: Math.max(0, bars.hp.x0 - Math.round(L * 1.75)), y: Math.max(0, bars.y0 - Math.round(L * .16)), w: Math.round(L * .42), h: Math.round(L * .25) };
}

const digits = value => Number(String(value).replace(/[^\d]/g, ''));

export function parseStatusText(text) {
  const clean = String(text).replace(/\s+/g, ' ');
  const pair = label => { const m = clean.match(new RegExp(`${label}\\s*[\\[(|]?\\s*([\\d,.]+)\\s*[/\\\\|]\\s*([\\d,.]+)`, 'i')); return m ? { now: digits(m[1]), max: digits(m[2]) } : null; };
  const hp = pair('HP'), mp = pair('MP');
  const e = clean.match(/EXP\.?\s*([\d,.]+)\s*[[(|]?\s*(\d{1,3}(?:[.,]\d{1,2})?)\s*%/i);
  const exp = e ? { value: digits(e[1]), percent: Number(e[2].replace(',', '.')) } : null;
  return {
    hp: hp && hp.max > 0 && hp.now <= hp.max ? hp : null,
    mp: mp && mp.max > 0 && mp.now <= mp.max ? mp : null,
    exp: exp && exp.percent <= 100 ? exp : null
  };
}

export function parseLevel(text) {
  const value = digits(String(text).match(/\d{1,3}/)?.[0] ?? '');
  return value >= 1 && value <= 250 ? value : null;
}

function longestRun(flags, maxGap = 0) {
  let best = null, start = -1, last = -1;
  for (let i = 0; i <= flags.length; i++) {
    if (i < flags.length && flags[i]) { if (start < 0 || i - last - 1 > maxGap) { if (start >= 0 && (!best || last - start > best[1] - best[0])) best = [start, last]; start = i; } last = i; }
  }
  if (start >= 0 && (!best || last - start > best[1] - best[0])) best = [start, last];
  return best;
}

// The Quest Helper panel is see-through (blue over sky, grey over a forest), so it is found by its
// fixed parts: the orange AUTO button followed by blue buttons in its header, and the light border
// column down its right edge. Returns the body below the header, or null.
const isAutoOrange = (r, g, b) => r > 180 && g > 85 && g < 160 && b < 130 && r - g > 50;
const isHeaderBlue = (r, g, b) => b > 180 && r < 130 && g > 120;

export function findQuestHelper(image) {
  const { width, height } = image;
  const runsOf = (y, test) => {
    const runs = [];
    for (let x = 0, start = -1; x <= width; x++) {
      const on = x < width && test(...at(image, x, y));
      if (on && start < 0) start = x;
      if (!on && start >= 0) { runs.push([start, x - 1]); start = -1; }
    }
    return runs;
  };
  const rows = [];
  for (let y = 0; y < height; y++) {
    for (const [a, b] of runsOf(y, isAutoOrange)) {
      const w = b - a + 1;
      if (w < 10 || w > 80) continue;
      // Chain the blue buttons: each starts shortly after the previous one ends.
      let right = b, count = 0;
      for (const [c, d] of runsOf(y, isHeaderBlue)) if (c > right && c - right < w * .8 && d - c + 1 >= w * .2) { right = d; count++; }
      if (count >= 1) { rows.push({ y, autoX: a, autoW: w, right }); break; }
    }
  }
  // The header is the first tight group of matching rows (orange/blue scenery further down is ignored).
  const group = rows.filter((row, i) => row.y - rows[0].y < rows[0].autoW * 1.2 && Math.abs(row.autoX - rows[0].autoX) <= 4);
  if (group.length < 3) return null;
  const header = { bottom: group[group.length - 1].y, autoX: group[0].autoX, autoW: group[0].autoW, right: Math.max(...group.map(r => r.right)) };
  const left = Math.max(0, Math.round(header.autoX - header.autoW * 9.8));
  const top = header.bottom + Math.max(2, Math.round(header.autoW * .15));
  // Bottom: the panel's thin light border, the one row clearly brighter than the rows around it.
  const x0 = left + header.autoW, x1 = Math.min(width - 1, header.right - header.autoW);
  const lum = y => { let sum = 0; for (let x = x0; x <= x1; x++) { const [r, g, b] = at(image, x, y); sum += (r + g + b) / 3; } return sum / (x1 - x0 + 1); };
  let bottom = -1;
  for (let y = top + header.autoW; y < height - 3; y++) {
    const v = lum(y);
    if (v >= 110 && v - Math.max(lum(y - 2), lum(y + 3)) >= 12) { bottom = y; break; }
  }
  if (bottom < 0 || bottom - top < header.autoW) return null;
  // Leave out the per-quest close buttons on the right.
  return { x: left, y: top, w: Math.max(1, header.right - left - Math.round(header.autoW * .9)), h: bottom - top };
}

// "30 / 30 Dark Stump". OCR often reads the slash as 7, l, I or |, or squeezes "1 / 1" into "111".
function progressLine(line) {
  const m = line.match(/^(\d{1,4})\s*[/7lI|\\£#{(f]\s*(\d{1,4})\s+(.{2,})$/);
  if (m) return { have: Number(m[1]), need: Number(m[2]), name: m[3] };
  // "0 730 Dark Stump" / "28 115 Green Mushroom Cap": the slash read as a leading 7 or 1.
  const glued = line.match(/^(\d{1,4})\s+[17](\d{1,4})\s+(\D.+)$/);
  if (glued) return { have: Number(glued[1]), need: Number(glued[2]), name: glued[3] };
  const squeezed = line.match(/^(\d{3,7})\s+(\D.+)$/);
  if (squeezed && squeezed[1].length % 2 === 1) {
    const half = (squeezed[1].length - 1) / 2, a = squeezed[1].slice(0, half), b = squeezed[1].slice(half + 1);
    if (a === b && /[17]/.test(squeezed[1][half])) return { have: Number(a), need: Number(b), name: squeezed[2] };
  }
  return null;
}

// All tracked quests in the panel: a title line followed by its "have / need name" lines.
// The first quest's fields are also returned at the top level.
export function parseQuestHelper(text) {
  const quests = [];
  for (const raw of String(text).split('\n')) {
    const line = raw.trim();
    if (!line || /quest\s*helper/i.test(line)) continue;
    const m = progressLine(line);
    if (m) {
      const current = quests[quests.length - 1];
      const name = m.name.replace(/[^\p{L}\p{N}' -]+/gu, '').trim();
      if (current && m.need > 0 && name) current.progress.push({ have: m.have, need: m.need, name, done: m.have >= m.need });
      continue;
    }
    if (/[A-Za-z]{3}/.test(line) && /^[A-Z]/.test(line.replace(/^[^\p{L}]+/u, ''))) {
      const cleaned = line.replace(/^[^\p{L}]+/u, '').replace(/[^\p{L}\p{N}.…!?')]+$/u, '');
      const truncated = /(\.{2,}|…)$/.test(cleaned);
      const title = cleaned.replace(/\s*(\.{2,}|…)$/, '').replace(/[^\p{L}\p{N}'!?,.:() -]+/gu, '').trim();
      if (title.length >= 4) quests.push({ title, truncated, progress: [] });
    }
  }
  for (const quest of quests) quest.complete = quest.progress.length > 0 && quest.progress.every(p => p.done);
  return quests.length ? { ...quests[0], quests } : null;
}

// Matches a (possibly truncated, possibly misread) Quest Helper title to a catalog quest name.
// Truncated titles are compared with the same-length start of each name.
export function matchQuestTitle(title, names, truncated = false) {
  const seen = normalize(title);
  if (seen.length < 4) return null;
  let best = null, bestScore = 0;
  for (const name of names) {
    const full = normalize(name), target = truncated && full.length > seen.length ? full.slice(0, seen.length) : full;
    const score = 1 - editDistance(seen, target) / Math.max(seen.length, target.length);
    if (score > bestScore || (score === bestScore && best && name.length < best.length)) { best = name; bestScore = score; }
  }
  return bestScore >= .8 ? best : null;
}

// The white chat input field; the chat log sits right above it.
export function findChatInput(image, { offsetY = 0 } = {}) {
  const { width, height } = image, rows = [];
  for (let y = 0; y < height; y++) {
    let run = 0, best = 0, bestX = 0;
    for (let x = 0; x <= width; x++) {
      if (x < width && isInputWhite(...at(image, x, y))) run++;
      else { if (run > best) { best = run; bestX = x - run; } run = 0; }
    }
    rows.push(best >= width * .2 ? { y, x: bestX, w: best } : null);
  }
  let bestRun = [], current = [];
  for (const row of rows) { if (row && (!current.length || Math.abs(row.x - current[0].x) < 12)) current.push(row); else current = row ? [row] : []; if (current.length > bestRun.length) bestRun = [...current]; }
  if (bestRun.length < 8) return null;
  const x = Math.min(...bestRun.map(r => r.x)), w = Math.max(...bestRun.map(r => r.x + r.w)) - x;
  return { x, y: bestRun[0].y + offsetY, w, h: bestRun.length };
}

export function chatLogRect(input, lines = 4) {
  const lineH = input.h * .96;
  const x = Math.max(0, Math.round(input.x - input.h * 5));
  return { x, y: Math.max(0, Math.round(input.y - lineH * (lines + .35))), w: Math.round(input.x + input.w + input.h * .5 - x), h: Math.round(lineH * lines) };
}

// Collapsed chat: no input field, just the newest line, sitting where the input field would be,
// directly above the status panel. Located from the status bars (calibrated at 2000 px wide).
export function collapsedChatRect(bars) {
  const L = bars.hp.length;
  const x = Math.max(0, Math.round(bars.hp.x0 - L * 2.1));
  return { x, y: Math.max(0, Math.round(bars.y0 - L * .47)), w: Math.round(bars.exp.x1 - x), h: Math.round(L * .18) };
}

// Ink by colour distance from each row's background (per-channel median): works for dark text on
// light chat colours, white text on yellow megaphones and orange item names alike. In place.
export function inkByContrast(image, minDistance = 90) {
  const { width, height, data } = image, hist = [new Uint32Array(256), new Uint32Array(256), new Uint32Array(256)];
  for (let y = 0; y < height; y++) {
    const median = [0, 0, 0];
    for (let c = 0; c < 3; c++) {
      hist[c].fill(0);
      for (let x = 0; x < width; x++) hist[c][data[(y * width + x) * 4 + c]]++;
      for (let count = 0; median[c] < 255 && (count += hist[c][median[c]]) < width / 2; median[c]++);
    }
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4, d = Math.hypot(data[i] - median[0], data[i + 1] - median[1], data[i + 2] - median[2]);
      data[i] = data[i + 1] = data[i + 2] = d > minDistance ? 0 : 255; data[i + 3] = 255;
    }
  }
  return image;
}

// Dark text (Quest Helper) → black; everything brighter → white. In place.
export function inkDark(image, threshold = 110) {
  const { data } = image;
  for (let i = 0; i < data.length; i += 4) { const ink = data[i] * .299 + data[i + 1] * .587 + data[i + 2] * .114 < threshold; data[i] = data[i + 1] = data[i + 2] = ink ? 0 : 255; data[i + 3] = 255; }
  return image;
}

// Tuned on real frames: [crop scale, ink] per HUD region.
export const OCR_SETTINGS = {
  status: { scale: 2, threshold: 140 },
  level: { scale: 3, threshold: 200 },
  helper: { scale: 3, threshold: 75 },
  chat: { scale: 2, distance: 90 },
  chatLine: { scale: 2, distance: 50 } // collapsed chat: one line, often pink-on-pink
};

// The in-game quest window (Q): a long bright-red line runs under its tab row (Available · In
// Progress · Completed) and the open tab is filled red/pink above it. Returns the list area under
// the line and which tab is open, or null. Works at any UI size (runs of 60 px and up).
export function findQuestWindow(image) {
  const { width, height, data } = image;
  const red = i => data[i] > 130 && data[i + 1] < 80 && data[i + 2] < 80 && data[i] - data[i + 1] > 90;
  const pink = i => data[i] > 200 && data[i] - data[i + 1] > 40 && data[i] - data[i + 2] > 25;
  let best = null;
  for (let y = 8; y < height - 8; y++) {
    let run = 0;
    for (let x = 0; x <= width; x++) {
      if (x < width && red((y * width + x) * 4)) { run++; continue; }
      if (run >= 60 && (!best || run > best.w)) best = { x: x - run, y, w: run };
      run = 0;
    }
  }
  if (!best) return null;
  // A thin line (the window's is 2-3 px), not a red bar like HP: few red rows around it.
  const redRows = [-4, -3, 3, 4].filter(dy => { const y = best.y + dy; if (y < 0 || y >= height) return false; let n = 0; for (let dx = 0; dx < best.w; dx += 2) if (red((y * width + best.x + dx) * 4)) n++; return n > best.w / 4; }).length;
  if (redRows > 0) return null;
  // Open tab: the third of the tab row above the line that is mostly red/pink.
  const tabH = Math.max(6, Math.round(best.w * .07)), names = ['available', 'progress', 'completed'];
  const share = third => {
    let n = 0, total = 0;
    for (let y = Math.max(0, best.y - tabH); y < best.y - 1; y++) for (let x = best.x + Math.round(best.w * (third / 3 + .04)); x < best.x + Math.round(best.w * ((third + 1) / 3 - .04)); x++) { total++; if (pink((y * width + x) * 4)) n++; }
    return total ? n / total : 0;
  };
  const shares = names.map((_, i) => share(i)), top = shares.indexOf(Math.max(...shares));
  const tab = shares[top] > .25 ? names[top] : null;
  const list = { x: best.x, y: best.y + 2, w: best.w, h: Math.min(height - best.y - 2, Math.round(best.w * 1.7)) };
  return { line: best, tab, list };
}

// Quest window list → black text on white for OCR. Normal rows already have dark text on white;
// blue rows (the selected quest and the town headers) have white text on blue, so on those rows
// the light pixels become ink and the blue becomes paper. In place; returns the image.
export function inkQuestList(image) {
  const { width, height, data } = image;
  for (let y = 0; y < height; y++) {
    let blue = 0;
    for (let x = 0; x < width; x++) { const i = (y * width + x) * 4; if (data[i + 2] > data[i] + 40 && data[i + 2] > 110) blue++; }
    const inverted = blue > width * .35;
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4, lum = data[i] * .299 + data[i + 1] * .587 + data[i + 2] * .114;
      const ink = inverted ? lum > 185 : lum < 150;
      data[i] = data[i + 1] = data[i + 2] = ink ? 0 : 255; data[i + 3] = 255;
    }
  }
  return image;
}

// How different two list signatures are (share of cells that changed). The leftmost columns (the
// blinking "!" quest icons) are left out, so an unchanged list is not read again and again.
export function listChange(a, b, n = 16, skipCols = 2) {
  if (!a || !b || a.length !== b.length) return 1;
  let diff = 0, total = 0;
  for (let i = 0; i < a.length; i++) { if (i % n < skipCols) continue; total++; if (a[i] !== b[i]) diff++; }
  return total ? diff / total : 1;
}

// Coarse light/dark pattern of the quest list, to notice when it scrolls or a town is expanded.
// The quest icons ("!" bulbs) in the left column animate, so that column is left out, and a few
// cells may differ before it counts as a change.
export function listSignature(image, { cols = 24, rows = 24, skipLeft = .14 } = {}) {
  const cells = [], x0 = Math.floor(image.width * skipLeft);
  for (let gy = 0; gy < rows; gy++) for (let gx = 0; gx < cols; gx++) {
    const x = x0 + Math.floor((gx + .5) * (image.width - x0) / cols), y = Math.floor((gy + .5) * image.height / rows), i = (y * image.width + x) * 4;
    cells.push(image.data[i] * .299 + image.data[i + 1] * .587 + image.data[i + 2] * .114 > 150 ? 1 : 0);
  }
  return cells;
}
export function listChanged(previous, next, share = .04) {
  if (!previous || previous.length !== next.length) return true;
  let differ = 0;
  for (let i = 0; i < next.length; i++) if (previous[i] !== next[i]) differ++;
  return differ > next.length * share;
}

// The job and character name sit between the level and the HP bar ("Rogue" over the character name).
export function nameRect(bars) {
  const level = levelRect(bars), x = level.x + level.w;
  return { x, y: Math.max(0, level.y - Math.round(level.h * .15)), w: Math.max(10, bars.hp.x0 - x - 4), h: Math.round(level.h * 1.3) };
}
// The character name from that area: the last line that looks like a MapleStory name.
export function parseName(text) {
  const lines = String(text).split(/\r?\n/).map(line => line.replace(/[^A-Za-z0-9]/g, '')).filter(Boolean);
  const name = lines.reverse().find(line => /^[A-Za-z][A-Za-z0-9]{3,11}$/.test(line) && !/^(beginner|warrior|magician|bowman|thief|rogue|swordsman|fighter|page|spearman|wizard|cleric|archer|hunter|crossbowman|assassin|bandit)$/i.test(line));
  return name ?? null;
}
