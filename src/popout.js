// Small, stable status line for the PC pop-out. Use the already computed route
// and EXP tracker; never infer progress from Quest Helper OCR.
export function popoutMetrics({ remaining = null, tracker = null, reading = false, fresh = true } = {}) {
  const portals = Number.isInteger(remaining) && remaining > 0
    ? `${remaining} portal${remaining === 1 ? '' : 's'} to destination` : '';
  const exp = reading
    ? !tracker ? 'Waiting for EXP…' : !fresh ? 'EXP/h unavailable' : tracker.minutes >= 2 && Number.isFinite(tracker.perHour)
      ? `${Math.round(tracker.perHour).toLocaleString()} EXP/h`
      : 'Measuring EXP/h…'
    : '';
  return [portals, exp].filter(Boolean).join(' · ');
}

// The Steam Deck pop-up's EXP lines: a big rate and a small detail line. Empty while not reading, so
// a stale rate is never shown over the game.
export function popupExp({ summary = null, reading = false, fresh = true } = {}) {
  if (!reading) return { rate: '', detail: '' };
  if (!summary) return { rate: 'Waiting for EXP…', detail: 'Reading the status bar' };
  const percent = Number.isFinite(summary.percent) ? `EXP ${summary.percent.toFixed(2)}%` : '';
  if (!fresh) return { rate: 'EXP/h unavailable', detail: [percent, 'waiting for the status bar'].filter(Boolean).join(' · ') };
  if (summary.minutes < .5) return { rate: 'Measuring EXP/h…', detail: percent };
  const rate = `${summary.minutes < 2 ? '~' : ''}${Math.round(summary.perHour).toLocaleString('en-US')} EXP/h`;
  const level = summary.minutes < 2 || summary.minutesToLevel == null ? ''
    : summary.minutesToLevel >= 120 ? `level in ${Math.round(summary.minutesToLevel / 60)} h` : `level in ${Math.round(summary.minutesToLevel)} min`;
  return { rate, detail: [percent, `${summary.percentPerHour.toFixed(1)}%/h`, level].filter(Boolean).join(' · ') };
}

// Said out loud every few minutes while Live GPS reads EXP (voice part 'exp'). Rounded so it is easy
// to hear; nothing until the rate has settled (2 minutes).
export const EXP_SPEECH_EVERY_MS = 3 * 60_000;
export function expSpeech(summary) {
  if (!summary || !(summary.minutes >= 2) || !Number.isFinite(summary.perHour) || summary.perHour <= 0) return '';
  const rate = summary.perHour >= 10_000 ? Math.round(summary.perHour / 1000) * 1000 : summary.perHour >= 1000 ? Math.round(summary.perHour / 100) * 100 : Math.round(summary.perHour);
  const level = summary.minutesToLevel == null ? '' : summary.minutesToLevel >= 120 ? ` Level up in about ${Math.round(summary.minutesToLevel / 60)} hours.`
    : summary.minutesToLevel >= 1 ? ` Level up in about ${Math.round(summary.minutesToLevel)} minutes.` : '';
  return `${rate.toLocaleString('en-US')} EXP an hour.${level}`;
}
