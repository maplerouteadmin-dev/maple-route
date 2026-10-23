// Checks every map's title the way the reader sees it: the clean title plus the misreadings OCR
// actually produces for roman numerals ("I" read as |, l or 1, glued to the word before it). Prints
// every title that would be read as the wrong map or not confidently enough to switch.
// Usage: node scripts/scan-titles.mjs   (fetches the public OSMS map list)
import { fetchOsms } from '../src/osms.js';
import { matchMap, normalize } from '../src/core.js';

// Same rule as the app's `confident` (app.js): top score ≥ .9 and ahead of any other-named map by > .03.
export function confidentPick(matches) {
  if (!matches[0] || matches[0].score < .9) return null;
  const rival = matches.find(m => normalize(m.map.name) !== normalize(matches[0].map.name));
  return !rival || matches[0].score - rival.score > .03 ? matches[0].map : null;
}

export function titleVariants(street, name) {
  const variants = [{ label: 'clean', text: `${street}\n${name}` }];
  const numeral = name.match(/^(.*\S)\s+(I{1,3})$/);
  if (numeral) {
    const [, base, roman] = numeral, n = roman.length;
    for (const [label, ch] of [['bars', '|'], ['l', 'l'], ['1', '1']]) {
      variants.push({ label: `${label} spaced`, text: `${street}\n${base} ${ch.repeat(n)}` });
      variants.push({ label: `${label} glued`, text: `${street}\n${base}${ch.repeat(n)}` });
    }
  }
  return variants;
}

export function scanTitles(maps) {
  const problems = [];
  for (const map of maps) {
    const street = (map.aliases ?? []).map(a => a.endsWith(` ${map.name}`) ? a.slice(0, -map.name.length - 1) : null).find(Boolean) ?? '';
    for (const { label, text } of titleVariants(street, map.name)) {
      const matches = matchMap(text, maps), pick = confidentPick(matches);
      if (!pick || normalize(pick.name) !== normalize(map.name)) problems.push({ map: map.name, label, text: text.replace('\n', ' / '), got: matches.slice(0, 3).map(m => `${m.map.name} ${m.score.toFixed(2)}`).join(', ') || 'nothing' });
    }
  }
  return problems;
}

if (process.argv[1]?.endsWith('scan-titles.mjs')) {
  const data = await fetchOsms();
  const problems = scanTitles(data.maps);
  const numbered = data.maps.filter(m => /\sI{1,3}$/.test(m.name)).length;
  console.log(`${data.maps.length} maps (${numbered} with a roman numeral), ${problems.length} problem titles`);
  for (const p of problems) console.log(`- ${p.map} [${p.label}] "${p.text}" -> ${p.got}`);
}
