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
