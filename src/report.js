// "Report a problem" / "Report a drop": a pre-filled GitHub issue the player reviews and submits
// themselves. Only app facts go in (map names, what the reader saw, screen size, quest step): never
// chat, character names or anything about other players. Nothing is sent until they press Submit.
export const REPO = 'maplerouteadmin-dev/maple-route';
const MAX_URL = 7000; // GitHub rejects very long new-issue links

export function issueUrl({ title, body, labels = [] }, repo = REPO) {
  let text = String(body ?? '');
  const build = () => `https://github.com/${repo}/issues/new?${new URLSearchParams({ title: String(title ?? '').slice(0, 120), body: text, ...(labels.length ? { labels: labels.join(',') } : {}) })}`;
  let url = build();
  while (url.length > MAX_URL && text.length > 200) { text = `${text.slice(0, Math.floor(text.length * .8))}\n…(trimmed)`; url = build(); }
  return url;
}

// Title reads from the live log: what the app read on the mini map and what it decided.
const reads = log => (log ?? []).filter(e => e?.kind === 'title').slice(-6)
  .map(e => `- \`${String(e.text ?? '').replace(/[\r\n`]+/g, ' ').trim().slice(0, 60) || '(nothing)'}\` → ${e.accepted ?? 'not matched'}${e.matches?.length ? ` (best: ${e.matches[0]})` : ''}`);

export function problemReport({ what = '', version = '', browser = '', frame = '', current = '', destination = '', quest = '', step = '', live = false, log = [] } = {}) {
  const lines = [
    '**What went wrong** (please describe):', '', what || '_…_', '',
    '**Paste the mini map picture here** (Maple Route copied it if you pressed "Copy mini map picture"; crop out any names).', '', '',
    '---', '<details><summary>Details from Maple Route</summary>', '',
    `- Version: ${version || '?'}`, `- Browser: ${browser || '?'}`, `- Live GPS: ${live ? `on, shared window ${frame || '?'}` : 'off'}`,
    `- Map: ${current || '?'}`, `- Destination: ${destination || '-'}`, ...(quest ? [`- Guided quest: ${quest}${step ? ` (step: ${step})` : ''}`] : []),
    ...(reads(log).length ? ['- Last mini map title reads:', ...reads(log)] : []), '', '</details>'
  ];
  return { title: `Problem on ${current || 'a map'}: `, body: lines.join('\n'), labels: ['bug'] };
}

export function dropReport({ item = '', monster = '', map = '', version = '' } = {}) {
  const clean = text => String(text ?? '').replace(/[\r\n]+/g, ' ').trim().slice(0, 80);
  return {
    title: `Drop: ${clean(item) || '?'} from ${clean(monster) || '?'}`,
    body: [`**Item:** ${clean(item)}`, `**Monster:** ${clean(monster)}`, `**Map:** ${clean(map) || '?'}`, '', 'Seen in MapleStory Classic World. (Optional: a screenshot of the drop or your inventory, names cropped out.)', '', `_Maple Route ${version}_`].join('\n'),
    labels: ['drop data']
  };
}
