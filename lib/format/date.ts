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
