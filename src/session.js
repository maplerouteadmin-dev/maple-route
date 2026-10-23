export function summarizeSession(input) {
  const startLevel = Number(input.startLevel), endLevel = Number(input.endLevel);
  const startExp = Number(input.startExp), endExp = Number(input.endExp);
  const startMesos = Number(input.startMesos), endMesos = Number(input.endMesos);
  const minutes = Number(input.minutes);
  if (![startLevel, endLevel, startExp, endExp, startMesos, endMesos, minutes].every(Number.isFinite)
    || !Number.isInteger(startLevel) || !Number.isInteger(endLevel) || startLevel < 1 || endLevel > 200 || endLevel < startLevel
    || startExp < 0 || endExp < 0 || startMesos < 0 || endMesos < 0 || [startExp, endExp, startMesos, endMesos].some(value => value > 1e12)
    || minutes <= 0 || minutes > 1440) throw new Error('Enter valid levels, EXP, mesos, and 1–1,440 minutes.');
  const gained = startLevel === endLevel ? endExp - startExp : Number(input.expGained);
  if (startLevel !== endLevel && (input.expGained === '' || input.expGained == null || gained <= 0) || !Number.isFinite(gained) || gained < 0)
    throw new Error('If you leveled up, enter total EXP gained manually; current-level EXP alone cannot be subtracted.');
  return { ...input, startLevel, endLevel, startExp, endExp, startMesos, endMesos, minutes, expGained: gained,
    mesoChange: endMesos - startMesos, expPerHour: Math.round(gained * 60 / minutes), mesosPerHour: Math.round((endMesos - startMesos) * 60 / minutes) };
}

export function bestMeasuredSpot(sessions, level, metric = 'expPerHour') {
  // Automatic (Live GPS) runs do not see mesos, so they never count as money measurements.
  return sessions.filter(row => Math.abs(row.startLevel - Number(level)) <= 5 && Number.isFinite(row[metric]) && !(row.auto && metric === 'mesosPerHour'))
    .sort((a, b) => b[metric] - a[metric])[0] ?? null;
}
