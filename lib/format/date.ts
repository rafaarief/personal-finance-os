/** "2026-07-01" -> "1 Jul 2026", for exact-date chart ticks/tooltips (not month-bucketed). */
export function formatShortDate(isoDate: string): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

/** ISO timestamp -> "1 Jul 2026, 14:32", for change-log rows where same-day edits need to stay distinguishable. */
export function formatDateTime(isoTimestamp: string): string {
  const date = new Date(isoTimestamp);
  return date.toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

/**
 * Rolls a manual value-edit date forward to its representative month-start
 * statement date — an edit made mid-month (e.g. 10 August) represents "the
 * September 1 position", not a stray mid-month data point, so the net worth
 * chart stays on clean monthly boundaries no matter which day money actually
 * moves between accounts. An edit made exactly on the 1st of a month IS that
 * month's statement date already, so it passes through unchanged.
 */
export function toNextStatementDate(editDate: string): string {
  const [year, month, day] = editDate.split("-").map(Number);
  if (day === 1) return editDate;
  // Date.UTC's month is 0-indexed; passing the 1-indexed `month` straight
  // through lands one month ahead (and rolls the year via Date's own
  // overflow handling for a December edit).
  return new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10);
}

export function currentMonthString(): string {
  return new Date().toISOString().slice(0, 7);
}

/** month in "YYYY-MM" -> the preceding month, also "YYYY-MM". */
export function previousMonthString(month: string): string {
  const [year, monthNumber] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, monthNumber - 1, 1));
  date.setUTCMonth(date.getUTCMonth() - 1);
  return date.toISOString().slice(0, 7);
}

/** `count` months ending at (and including) `month`, most recent first — e.g. lastNMonths("2026-07", 3) -> ["2026-07", "2026-06", "2026-05"]. */
export function lastNMonths(month: string, count: number): string[] {
  const months: string[] = [month];
  for (let i = 1; i < count; i++) {
    months.push(previousMonthString(months[months.length - 1]));
  }
  return months;
}
