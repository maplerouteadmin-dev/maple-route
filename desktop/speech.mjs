// Argument vectors only: never pass text through a shell.
export function speechCandidates(words, rate = 1) {
  const text = String(words ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 500);
  if (!text) return [];
  const speed = Math.max(80, Math.min(300, Math.round(175 * (Number(rate) || 1))));
  const relative = Math.max(-100, Math.min(100, Math.round(((Number(rate) || 1) - 1) * 100)));
  return [
    { command: 'espeak-ng', args: ['-s', String(speed), '--', text] },
    { command: 'spd-say', args: ['--wait', '-r', String(relative), '--', text] }
  ];
}
