/** "2026-07-01" -> "1 Jul 2026", for exact-date chart ticks/tooltips (not month-bucketed). */
export function formatShortDate(isoDate: string): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
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
