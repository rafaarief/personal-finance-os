/**
 * Historical wealth snapshots, 2023-03-25 through 2026-05-01.
 *
 * IMPORTANT CONTEXT discovered during inspection: this exact range was
 * already imported earlier in production via
 * scripts/import-accounting-calculation.ts (same source workbook — that
 * script covered the *entire* sheet in one pass, including this range plus
 * the later 2026-06-04 and 2026-07-01 statements). Running this script is
 * therefore primarily a **reconciliation/audit pass** against a much more
 * precise, hand-verified dataset, not a fresh import — except for one row
 * with a real bug: see DATE CORRECTION 2 below.
 *
 * DATE CORRECTION 1 — "31/09/2023" (invalid, September has 30 days):
 *   source_date_raw = "31/09/2023"
 *   normalized to    = 2023-09-30
 *   Already correct in the DB from the earlier import (which special-cased
 *   this exact invalid string). Confirmed by reconciliation below, not
 *   re-derived here.
 *
 * DATE CORRECTION 2 — "31/12/2024" (a real, valid date, but almost
 * certainly a data-entry year error for "31/12/2023"):
 *   source_date_raw = "31/12/2024"
 *   normalized to    = 2023-12-31
 *   The earlier import parsed this literally as a real Excel date serial
 *   (2024-12-31) since nothing about the cell value itself was invalid —
 *   only reconciling the surrounding snapshot-change chain (which this
 *   script does, per row, below) reveals it belongs a year earlier. THIS
 *   IS A REAL BUG this script fixes: it deletes the wrongly-dated
 *   2024-12-31 snapshot rows and writes correctly-dated 2023-12-31 rows
 *   in their place, inside the same transaction.
 *
 * KNOWN UNRESOLVED DISCREPANCY (reported, not silently forced): the
 * 2023-12-31 row's individual balances sum to Rp106,040,761, but the
 * statement's own reported total is Rp105,626,761 — a gap of exactly
 * Rp414,000, matching the BreadWinner balance in this row. Same pattern as
 * a separate discrepancy found in the June 2026 statement (TENS excluded
 * from that row's stated total) — most likely the original spreadsheet's
 * "total" formula didn't yet include a just-added business column. Per
 * "derive totals from balance-history records rather than trusting
 * manually-stored aggregates," this script imports the individual balance
 * as given and lets the dashboard derive the true total from actual
 * snapshot rows, rather than silently dropping BreadWinner to force a
 * match. Flagged in the reconciliation table below every run.
 *
 * Usage:
 *   pnpm finance:import:historical --dry-run [--from=YYYY-MM-DD] [--to=YYYY-MM-DD]
 *   pnpm finance:import:historical --apply [--from=YYYY-MM-DD] [--to=YYYY-MM-DD]
 * Default (no --dry-run/--apply flag) is --dry-run.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { and, eq, inArray, notInArray, sql } from "drizzle-orm";
import { getDb, schema } from "../lib/db/client";

type Category = "cash" | "investment" | "business" | "other";

interface AssetDef {
  category: Category;
  subcategory: string;
}

/** Canonical name -> classification. Aliases resolve to these same canonical names before lookup. */
const ASSET_DEFS: Record<string, AssetDef> = {
  BCA: { category: "cash", subcategory: "BCA" },
  BNI: { category: "cash", subcategory: "BNI" },
  "Bank Jago": { category: "cash", subcategory: "Jago" },
  Mandiri: { category: "cash", subcategory: "Mandiri" },
  GoPay: { category: "cash", subcategory: "GoPay" },
  OVO: { category: "cash", subcategory: "OVO" },
  ShopeePay: { category: "cash", subcategory: "ShopeePay" },
  "Cash on Hand": { category: "cash", subcategory: "Cash" },
  "Narin Capital": { category: "investment", subcategory: "Narin Capital" },
  Bitget: { category: "investment", subcategory: "Bitget" },
  Stockbit: { category: "investment", subcategory: "Stockbit" },
  Pintu: { category: "investment", subcategory: "Pintu" },
  "Bybit Ateng": { category: "investment", subcategory: "Bybit" },
  "Reku Spot": { category: "investment", subcategory: "Reku" },
  "Reku US": { category: "investment", subcategory: "Reku" },
  Pluang: { category: "investment", subcategory: "Pluang" },
  PWN: { category: "business", subcategory: "PWN" },
  // NOTE: existing DB asset for "A" is stored as "Ashfa" (category business) — see
  // scripts/import-june-2026-closing.ts for the same alias. Matched by alias below;
  // name/category are NOT changed here, only new snapshot rows are added.
  // category=other, not business — matches scripts/import-june-2026-closing.ts's fix
  // (the July 2026 statement's Business/Other targets only reconcile this way).
  Ashfa: { category: "other", subcategory: "Ashfa" },
  Arisan: { category: "other", subcategory: "Receivable" },
  Baswara: { category: "business", subcategory: "Baswara" },
  BoothyCall: { category: "business", subcategory: "BoothyCall" },
  BreadWinner: { category: "business", subcategory: "Breadwinner" },
  Sundrip: { category: "business", subcategory: "Sundrip" },
  TENS: { category: "business", subcategory: "TENS" },
  "BoothyCall Analog": { category: "business", subcategory: "Analog" },
};

const ALIASES: Record<string, string> = {
  Jago: "Bank Jago",
  NARIN: "Narin Capital",
  Narin: "Narin Capital",
  "BYBIT ATENG": "Bybit Ateng",
  "REKU SPOT": "Reku Spot",
  "REKU US": "Reku US",
  "CASH ON HAND": "Cash on Hand",
  boothycall: "BoothyCall",
  A: "Ashfa",
};

export function canonicalName(rawName: string): string {
  return ALIASES[rawName] ?? rawName;
}

export const LIQUID_NAMES = new Set([
  "BCA",
  "BNI",
  "Bank Jago",
  "Mandiri",
  "GoPay",
  "OVO",
  "ShopeePay",
  "Cash on Hand",
  "Narin Capital",
  "Bitget",
  "Stockbit",
  "Pintu",
  "Bybit Ateng",
  "Reku Spot",
  "Reku US",
  "Pluang",
]);

export interface SourceRow {
  sourceDateRaw: string;
  snapshotDate: string;
  dateNormalizationNote?: string;
  balances: Record<string, number>;
  liquidAssets: number;
  nonLiquidAssets: number;
  totalAssets: number;
  sourceGain: number | null;
}

// --- Source dataset, exactly as reconciled and provided ---------------------

export const SOURCE_ROWS: SourceRow[] = [
  { sourceDateRaw: "25/03/2023", snapshotDate: "2023-03-25", balances: { BCA: 6000000, BNI: 1600000, "Bank Jago": 29500000, "Narin Capital": 4000000, PWN: 27000000 }, liquidAssets: 41100000, nonLiquidAssets: 27000000, totalAssets: 68100000, sourceGain: null },
  { sourceDateRaw: "28/04/2023", snapshotDate: "2023-04-28", balances: { BCA: 1500000, "Bank Jago": 31000000, "Narin Capital": 10000000, "Cash on Hand": 350000, PWN: 27000000 }, liquidAssets: 42850000, nonLiquidAssets: 27000000, totalAssets: 69850000, sourceGain: 1750000 },
  { sourceDateRaw: "29/05/2023", snapshotDate: "2023-05-29", balances: { BCA: 2100000, BNI: 6211000, "Bank Jago": 31000000, "Narin Capital": 13000000, "Cash on Hand": 100000, PWN: 25950000 }, liquidAssets: 52411000, nonLiquidAssets: 25950000, totalAssets: 78361000, sourceGain: 8511000 },
  { sourceDateRaw: "30/06/2023", snapshotDate: "2023-06-30", balances: { BCA: 21126000, BNI: 5450000, "Bank Jago": 0, GoPay: 89000, OVO: 46000, ShopeePay: 3000, "Narin Capital": 27800000, "Cash on Hand": 280000, PWN: 25463000, Baswara: 200000 }, liquidAssets: 54794000, nonLiquidAssets: 25663000, totalAssets: 80457000, sourceGain: 2096000 },
  { sourceDateRaw: "30/07/2023", snapshotDate: "2023-07-30", balances: { BCA: 41374474, BNI: 5291468, "Bank Jago": 0, "Narin Capital": 29674610, Pintu: 3000000, "Cash on Hand": 10000, PWN: 20063000, Baswara: 200000, BoothyCall: 2461000 }, liquidAssets: 79350552, nonLiquidAssets: 22724000, totalAssets: 102074552, sourceGain: 21617552 },
  { sourceDateRaw: "31/08/2023", snapshotDate: "2023-08-31", balances: { BCA: 47740428, BNI: 4500000, GoPay: 62000, OVO: 3000, ShopeePay: 105000, Stockbit: 20500000, Pintu: 5000000, "Cash on Hand": 200000, PWN: 19738500, Baswara: 200000, BoothyCall: 2461000 }, liquidAssets: 78110428, nonLiquidAssets: 22399500, totalAssets: 100509928, sourceGain: -1564624 },
  { sourceDateRaw: "31/09/2023", snapshotDate: "2023-09-30", dateNormalizationNote: "Normalized invalid 31 September date to 30 September 2023.", balances: { BCA: 36901000, BNI: 10068000, "Bank Jago": 7998000, GoPay: 52000, OVO: 3000, ShopeePay: 105000, Stockbit: 20500000, Pintu: 5000000, "Cash on Hand": 509000, PWN: 18499000, Baswara: 200000, BoothyCall: 2461000 }, liquidAssets: 81136000, nonLiquidAssets: 21160000, totalAssets: 102296000, sourceGain: 1786072 },
  { sourceDateRaw: "31/12/2024", snapshotDate: "2023-12-31", dateNormalizationNote: "Interpreted as 31 December 2023 based on chronological position and exact snapshot-change reconciliation.", balances: { BCA: 45050130, BNI: 11343800, "Bank Jago": 3774831, GoPay: 0, OVO: 3000, ShopeePay: 105000, Stockbit: 20500000, Pintu: 5000000, "Cash on Hand": 200000, PWN: 17189000, Baswara: 0, BoothyCall: 2461000, BreadWinner: 414000 }, liquidAssets: 85976761, nonLiquidAssets: 19650000, totalAssets: 105626761, sourceGain: 3330761 },
  { sourceDateRaw: "08/02/2024", snapshotDate: "2024-02-08", balances: { BCA: 47566000, BNI: 12912000, "Bank Jago": 9918000, Stockbit: 20500000, "Cash on Hand": 200000, PWN: 19035000, BoothyCall: 7406000 }, liquidAssets: 91096000, nonLiquidAssets: 19035000, totalAssets: 110131000, sourceGain: 4504239 },
  { sourceDateRaw: "01/04/2024", snapshotDate: "2024-04-01", balances: { BCA: 36000000, BNI: 14000000, Stockbit: 19510500, Pintu: 23000000, "Bybit Ateng": 5750000, "Cash on Hand": 0, PWN: 17210000, BoothyCall: 4406000 }, liquidAssets: 98260500, nonLiquidAssets: 17210000, totalAssets: 115470500, sourceGain: 5339500 },
  { sourceDateRaw: "03/10/2024", snapshotDate: "2024-10-03", balances: { BCA: 12000000, BNI: 5000000, Stockbit: 26000000, Pintu: 5050000, PWN: 13270000, Ashfa: 22000000, Arisan: 5000000, Baswara: 60000000, BreadWinner: 12000000 }, liquidAssets: 48050000, nonLiquidAssets: 112270000, totalAssets: 160320000, sourceGain: 44849500 },
  { sourceDateRaw: "14/11/2024", snapshotDate: "2024-11-14", balances: { BCA: 10000000, BNI: 6000000, Stockbit: 24500000, PWN: 11070000, Ashfa: 102000000, BreadWinner: 15200000 }, liquidAssets: 40500000, nonLiquidAssets: 128270000, totalAssets: 168770000, sourceGain: 8450000 },
  { sourceDateRaw: "14/12/2024", snapshotDate: "2024-12-14", balances: { Stockbit: 32750000, Baswara: 60000000 }, liquidAssets: 32750000, nonLiquidAssets: 60000000, totalAssets: 92750000, sourceGain: -76020000 },
  { sourceDateRaw: "04/02/2025", snapshotDate: "2025-02-04", balances: { BCA: 22000000, "Bank Jago": 17100000, "Narin Capital": 2000000, Stockbit: 32750000, PWN: 83400000, Ashfa: 2000000, Arisan: 96500000, Baswara: -40000000 }, liquidAssets: 73850000, nonLiquidAssets: 141900000, totalAssets: 215750000, sourceGain: 123000000 },
  { sourceDateRaw: "04/03/2025", snapshotDate: "2025-03-04", balances: { BCA: 62000000, BNI: 2500000, "Bank Jago": 8000000, Stockbit: 32750000, PWN: 80000000, Ashfa: 3000000, Arisan: 76500000, Baswara: -26500000 }, liquidAssets: 105250000, nonLiquidAssets: 133000000, totalAssets: 238250000, sourceGain: 22500000 },
  { sourceDateRaw: "04/04/2025", snapshotDate: "2025-04-04", balances: { BCA: 94000000, BNI: 3000000, "Bank Jago": 18000000, Mandiri: 9750000, Stockbit: 32750000, Pintu: 8000000, "Bybit Ateng": 10000000, "Cash on Hand": 200000, PWN: 25000000, Ashfa: 4000000, Arisan: 70000000, Baswara: -19313067 }, liquidAssets: 175700000, nonLiquidAssets: 79686933, totalAssets: 255386933, sourceGain: 17136933 },
  { sourceDateRaw: "04/05/2025", snapshotDate: "2025-05-04", balances: { BCA: 94000000, BNI: 4000000, "Bank Jago": 10000000, Mandiri: 19500000, Stockbit: 32750000, Pintu: 8000000, "Bybit Ateng": 12000000, PWN: 25000000, Ashfa: 5000000, Arisan: 62343781 }, liquidAssets: 180250000, nonLiquidAssets: 92343781, totalAssets: 272593781, sourceGain: 17206848 },
  { sourceDateRaw: "04/06/2025", snapshotDate: "2025-06-04", balances: { BCA: 76000000, BNI: 5000000, "Bank Jago": 2800000, Mandiri: 29250000, Stockbit: 32750000, Pintu: 16000000, "Bybit Ateng": 19000000, "Reku Spot": 15430000, PWN: 25000000, Arisan: 40000000, Baswara: 19813000 }, liquidAssets: 196230000, nonLiquidAssets: 84813000, totalAssets: 281043000, sourceGain: 8449219 },
  { sourceDateRaw: "04/07/2025", snapshotDate: "2025-07-04", balances: { BCA: 55000000, BNI: 6000000, "Bank Jago": 18000000, Mandiri: 39000000, Stockbit: 32750000, Pintu: 16000000, "Bybit Ateng": 23000000, "Reku Spot": 20000000, "Reku US": 20000000, "Cash on Hand": 1900000, PWN: 25000000, Arisan: 40000000, Baswara: 19813000 }, liquidAssets: 229750000, nonLiquidAssets: 86713000, totalAssets: 316463000, sourceGain: 35420000 },
  { sourceDateRaw: "04/08/2025", snapshotDate: "2025-08-04", balances: { BCA: 31000000, BNI: 800000, "Bank Jago": 7000000, Mandiri: 48750000, "Narin Capital": 33000000, Stockbit: 32000000, Pintu: 34750000, "Bybit Ateng": 41000000, "Reku Spot": 38000000, "Cash on Hand": 3100000, PWN: 25000000, Arisan: 40000000, Baswara: 20513000 }, liquidAssets: 266300000, nonLiquidAssets: 88613000, totalAssets: 354913000, sourceGain: 38450000 },
  { sourceDateRaw: "04/09/2025", snapshotDate: "2025-09-04", balances: { BCA: 33000000, BNI: 1600000, "Bank Jago": 200000, Mandiri: 2000000, "Narin Capital": 45000000, Stockbit: 31000000, Pintu: 34750000, "Bybit Ateng": 45000000, "Reku Spot": 42000000, "Reku US": 4000000, "Cash on Hand": 4000000, PWN: 25000000, Arisan: 75349401, Baswara: 20513000, BoothyCall: 15223500 }, liquidAssets: 238550000, nonLiquidAssets: 140085901, totalAssets: 378635901, sourceGain: 23722901 },
  { sourceDateRaw: "04/10/2025", snapshotDate: "2025-10-04", balances: { BCA: 23000000, BNI: 2500000, "Bank Jago": 18400000, Mandiri: 1300000, OVO: 7468400, ShopeePay: 2400000, "Narin Capital": 45000000, Stockbit: 26000000, Pintu: 34750000, "Bybit Ateng": 52000000, "Reku Spot": 48000000, "Cash on Hand": 4000000, PWN: 25000000, Arisan: 4900000, Baswara: 75349401, BoothyCall: 20513000, BreadWinner: 10000000 }, liquidAssets: 260818400, nonLiquidAssets: 139762401, totalAssets: 400580801, sourceGain: 21944900 },
  { sourceDateRaw: "04/11/2025", snapshotDate: "2025-11-04", balances: { BCA: 55000000, BNI: 3300000, "Bank Jago": 11000000, Mandiri: 1000000, GoPay: 750000, OVO: 1812500, ShopeePay: 2400000, "Narin Capital": 50000000, Stockbit: 26000000, Pintu: 34750000, "Bybit Ateng": 52000000, "Reku Spot": 48000000, "Reku US": 4000000, "Cash on Hand": 4250000, PWN: 25000000, Arisan: 4900000, Baswara: 75349401, BoothyCall: 20513000, BreadWinner: 6442390 }, liquidAssets: 290012500, nonLiquidAssets: 136454791, totalAssets: 426467291, sourceGain: 25886490 },
  { sourceDateRaw: "04/12/2025", snapshotDate: "2025-12-04", balances: { BCA: 80000000, BNI: 4100000, "Bank Jago": 6100000, Mandiri: 600000, GoPay: 1300000, OVO: 4000000, "Narin Capital": 50000000, Stockbit: 26000000, Pintu: 34750000, "Bybit Ateng": 52000000, "Reku Spot": 48000000, "Reku US": 4000000, "Cash on Hand": 5300000, PWN: 25000000, Arisan: 4900000, Baswara: 75349401, BoothyCall: 20513000, BreadWinner: 6442390 }, liquidAssets: 310850000, nonLiquidAssets: 137504791, totalAssets: 448354791, sourceGain: 21887500 },
  { sourceDateRaw: "01/01/2026", snapshotDate: "2026-01-01", balances: { BCA: 98847546, BNI: 5000000, "Bank Jago": 19400000, Mandiri: 600000, OVO: 4000000, "Narin Capital": 60000000, Stockbit: 26000000, Pintu: 34750000, "Bybit Ateng": 52000000, "Reku Spot": 48000000, "Reku US": 4000000, "Cash on Hand": 6850000, PWN: 25000000, Baswara: 75349401, BoothyCall: 20513000, BreadWinner: 6442390 }, liquidAssets: 352597546, nonLiquidAssets: 134154791, totalAssets: 486752337, sourceGain: 38397546 },
  { sourceDateRaw: "01/02/2026", snapshotDate: "2026-02-01", balances: { BCA: 169000000, BNI: 900000, "Bank Jago": 17000000, Mandiri: 600000, OVO: 1850000, Stockbit: 125671142, Pintu: 17240446, "Bybit Ateng": 34750000, "Reku Spot": 5088412, "Reku US": 26257171, Pluang: 8000000, "Cash on Hand": 7850000, PWN: 25000000, Baswara: 75349401, BoothyCall: 20513000, BreadWinner: 6000000 }, liquidAssets: 406357171, nonLiquidAssets: 134712401, totalAssets: 541069572, sourceGain: 54317235 },
  { sourceDateRaw: "01/03/2026", snapshotDate: "2026-03-01", balances: { BCA: 285000000, BNI: 900000, "Bank Jago": 17000000, Mandiri: 600000, OVO: 1850000, Stockbit: 125671142, Pintu: 17240446, "Bybit Ateng": 34750000, "Reku Spot": 5088412, "Reku US": 26257171, Pluang: 8000000, "Cash on Hand": 8850000, PWN: 25000000, Baswara: 75349401, BoothyCall: 20513000, BreadWinner: 6000000 }, liquidAssets: 522357171, nonLiquidAssets: 135712401, totalAssets: 658069572, sourceGain: 117000000 },
  { sourceDateRaw: "01/04/2026", snapshotDate: "2026-04-01", balances: { BCA: 260000000, BNI: 2500000, "Bank Jago": 15500000, Mandiri: 2800000, Stockbit: 145671142, Pintu: 17240446, "Bybit Ateng": 34750000, "Reku Spot": 5088412, "Reku US": 26257171, Pluang: 8000000, "Cash on Hand": 1000000, PWN: 25000000, Ashfa: 15000000, Arisan: 87125000, Baswara: 75349401, BoothyCall: 20513000, BreadWinner: 6000000 }, liquidAssets: 518807171, nonLiquidAssets: 228987401, totalAssets: 747794572, sourceGain: 89725000 },
  { sourceDateRaw: "01/05/2026", snapshotDate: "2026-05-01", balances: { BCA: 349720000, BNI: 1200000, "Bank Jago": 17400000, Mandiri: 6000000, Stockbit: 145671142, Pintu: 17240446, "Bybit Ateng": 34750000, "Reku Spot": 5088412, "Reku US": 26257171, Pluang: 8000000, PWN: 25000000, Ashfa: 15000000, Arisan: 87125000, Baswara: 75349401, BoothyCall: 20513000, BreadWinner: 6000000 }, liquidAssets: 611327171, nonLiquidAssets: 228987401, totalAssets: 840314572, sourceGain: 92520000 },
];

// The one date that needs migrating off its (wrong) original date.
export const WRONG_DATE_TO_CLEAR = "2024-12-31";
export const CORRECTED_DATE = "2023-12-31";

export interface ReconciliationRow {
  snapshotDate: string;
  sourceLiquid: number;
  calculatedLiquid: number;
  sourceNonLiquid: number;
  calculatedNonLiquid: number;
  sourceTotal: number;
  calculatedTotal: number;
  sourceGain: number | null;
  calculatedChange: number | null;
  status: "OK" | "MISMATCH";
  note?: string;
}

export function reconcile(rows: SourceRow[]): ReconciliationRow[] {
  const results: ReconciliationRow[] = [];
  let previousCalculatedTotal: number | null = null;

  for (const row of rows) {
    let calculatedLiquid = 0;
    let calculatedNonLiquid = 0;
    for (const [rawName, value] of Object.entries(row.balances)) {
      const name = canonicalName(rawName);
      if (LIQUID_NAMES.has(name)) calculatedLiquid += value;
      else calculatedNonLiquid += value;
    }
    const calculatedTotal = calculatedLiquid + calculatedNonLiquid;
    const calculatedChange = previousCalculatedTotal !== null ? calculatedTotal - previousCalculatedTotal : null;

    const liquidOk = calculatedLiquid === row.liquidAssets;
    const nonLiquidOk = calculatedNonLiquid === row.nonLiquidAssets;
    const totalOk = calculatedTotal === row.totalAssets;
    const gainOk = row.sourceGain === null || calculatedChange === null || calculatedChange === row.sourceGain;

    let note: string | undefined;
    if (!nonLiquidOk || !totalOk) {
      const gap = row.totalAssets - calculatedTotal;
      note = `Reported total is off by ${-gap} vs sum of individual balances — importing individual balances as given (see script header for known cause).`;
    }

    results.push({
      snapshotDate: row.snapshotDate,
      sourceLiquid: row.liquidAssets,
      calculatedLiquid,
      sourceNonLiquid: row.nonLiquidAssets,
      calculatedNonLiquid,
      sourceTotal: row.totalAssets,
      calculatedTotal,
      sourceGain: row.sourceGain,
      calculatedChange,
      status: liquidOk && nonLiquidOk && totalOk && gainOk ? "OK" : "MISMATCH",
      note,
    });

    previousCalculatedTotal = calculatedTotal;
  }

  return results;
}

function parseArgs() {
  const args = process.argv.slice(2);
  const isDryRun = !args.includes("--apply"); // default dry-run
  const from = args.find((a) => a.startsWith("--from="))?.split("=")[1];
  const to = args.find((a) => a.startsWith("--to="))?.split("=")[1];
  return { isDryRun, from, to };
}

async function main() {
  const { isDryRun, from, to } = parseArgs();

  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set (checked .env.local). Refusing to continue.");
  }

  const rowsInRange = SOURCE_ROWS.filter(
    (r) => (!from || r.snapshotDate >= from) && (!to || r.snapshotDate <= to)
  );

  // --- 1. Independent verification of every row, before touching the DB ------
  const reconciliation = reconcile(rowsInRange);

  console.log("");
  console.log(`Mode: ${isDryRun ? "DRY RUN (no writes)" : "APPLY"}`);
  console.log(`Range: ${from ?? rowsInRange[0]?.snapshotDate} to ${to ?? rowsInRange[rowsInRange.length - 1]?.snapshotDate} (${rowsInRange.length} rows)`);
  console.log("");
  console.log("Reconciliation table:");
  console.log(
    "date".padEnd(12),
    "src-liquid".padStart(12),
    "calc-liquid".padStart(12),
    "src-nonliq".padStart(12),
    "calc-nonliq".padStart(12),
    "src-total".padStart(12),
    "calc-total".padStart(12),
    "src-gain".padStart(12),
    "calc-change".padStart(12),
    "status"
  );
  for (const r of reconciliation) {
    console.log(
      r.snapshotDate.padEnd(12),
      String(r.sourceLiquid).padStart(12),
      String(r.calculatedLiquid).padStart(12),
      String(r.sourceNonLiquid).padStart(12),
      String(r.calculatedNonLiquid).padStart(12),
      String(r.sourceTotal).padStart(12),
      String(r.calculatedTotal).padStart(12),
      String(r.sourceGain ?? "—").padStart(12),
      String(r.calculatedChange ?? "—").padStart(12),
      r.status
    );
    if (r.note) console.log(`  note: ${r.note}`);
  }

  const mismatches = reconciliation.filter((r) => r.status === "MISMATCH");
  console.log("");
  console.log(`${reconciliation.length - mismatches.length}/${reconciliation.length} rows reconcile exactly. ${mismatches.length} flagged (see notes above) — imported anyway per "derive totals from balance records" policy, not silently forced.`);

  const first = rowsInRange[0];
  const last = rowsInRange[rowsInRange.length - 1];
  if (first && last) {
    console.log("");
    console.log(`First snapshot: ${first.snapshotDate}, total ${first.totalAssets}`);
    console.log(`Last snapshot:  ${last.snapshotDate}, total ${last.totalAssets}`);
    console.log(`Historical increase: ${last.totalAssets - first.totalAssets} (a derived snapshot-to-snapshot change, not income)`);
  }

  // --- 2. Diff against the DB ---------------------------------------------------
  const db = getDb();
  const existingAssets = await db
    .select({ id: schema.assets.id, name: schema.assets.name })
    .from(schema.assets);
  const existingAssetByName = new Map(existingAssets.map((a) => [a.name.toLowerCase(), a]));

  const allDates = rowsInRange.map((r) => r.snapshotDate);
  const existingSnapshots = allDates.length
    ? await db
        .select({
          assetId: schema.assetValueSnapshots.assetId,
          snapshotDate: schema.assetValueSnapshots.snapshotDate,
          currentValue: schema.assetValueSnapshots.currentValue,
        })
        .from(schema.assetValueSnapshots)
        .where(inArray(schema.assetValueSnapshots.snapshotDate, allDates))
    : [];
  const existingSnapshotKey = new Map(existingSnapshots.map((s) => [`${s.assetId}::${s.snapshotDate}`, s.currentValue]));

  const wrongDateRows = rowsInRange.some((r) => r.snapshotDate === CORRECTED_DATE)
    ? await db
        .select({ assetId: schema.assetValueSnapshots.assetId, currentValue: schema.assetValueSnapshots.currentValue })
        .from(schema.assetValueSnapshots)
        .where(eq(schema.assetValueSnapshots.snapshotDate, WRONG_DATE_TO_CLEAR))
    : [];

  let assetsCreated = 0;
  let snapshotsInserted = 0;
  let snapshotsUpdated = 0;
  let snapshotsUnchanged = 0;

  console.log("");
  if (wrongDateRows.length > 0) {
    console.log(`Date correction: will delete ${wrongDateRows.length} mis-dated snapshot rows at ${WRONG_DATE_TO_CLEAR} and replace with correctly-dated rows at ${CORRECTED_DATE}.`);
  }

  if (isDryRun) {
    for (const row of rowsInRange) {
      for (const [rawName, value] of Object.entries(row.balances)) {
        const name = canonicalName(rawName);
        const existing = existingAssetByName.get(name.toLowerCase());
        if (!existing) {
          assetsCreated++;
          snapshotsInserted++;
          continue;
        }
        const key = `${existing.id}::${row.snapshotDate}`;
        const existingValue = existingSnapshotKey.get(key);
        if (existingValue === undefined) snapshotsInserted++;
        else if (parseFloat(existingValue) !== value) snapshotsUpdated++;
        else snapshotsUnchanged++;
      }
    }

    console.log("");
    console.log(`Assets to create: ${assetsCreated}`);
    console.log(`Balance records to insert: ${snapshotsInserted}`);
    console.log(`Balance records to update: ${snapshotsUpdated}`);
    console.log(`Balance records unchanged: ${snapshotsUnchanged}`);
    console.log("");
    console.log("Dry run complete — no writes performed.");
    process.exit(0);
  }

  // --- 3. Apply, inside one transaction ---------------------------------------
  // Batched as few round-trips as possible (one bulk upsert per snapshot date,
  // not one per asset-date pair) — a fully row-by-row version of this ran into
  // Neon connection resets on ~500 sequential awaited statements in one
  // transaction; this cuts that to ~1 per date (~29 total).
  await db.transaction(async (tx) => {
    if (wrongDateRows.length > 0) {
      await tx.delete(schema.assetValueSnapshots).where(eq(schema.assetValueSnapshots.snapshotDate, WRONG_DATE_TO_CLEAR));
    }

    // Pass 1: create any missing assets first (sequential is fine — expected to be rare/zero).
    for (const row of rowsInRange) {
      for (const rawName of Object.keys(row.balances)) {
        const name = canonicalName(rawName);
        if (existingAssetByName.has(name.toLowerCase())) continue;

        const def = ASSET_DEFS[name];
        if (!def) throw new Error(`No asset definition for "${name}" — refusing to create with unknown classification.`);
        const [created] = await tx
          .insert(schema.assets)
          .values({
            category: def.category,
            subcategory: def.subcategory,
            name,
            currentValue: row.balances[rawName].toString(),
            currency: "IDR",
            notes: "Created by scripts/import-historical-wealth-snapshots.ts",
            lastUpdatedAt: new Date(`${row.snapshotDate}T00:00:00Z`),
          })
          .returning({ id: schema.assets.id });
        existingAssetByName.set(name.toLowerCase(), { id: created.id, name });
        assetsCreated++;
      }
    }

    // Pass 2: one bulk upsert per snapshot date, covering all accounts reported that day.
    for (const row of rowsInRange) {
      const values = Object.entries(row.balances).map(([rawName, value]) => {
        const name = canonicalName(rawName);
        const existing = existingAssetByName.get(name.toLowerCase())!;

        const key = `${existing.id}::${row.snapshotDate}`;
        const existingValue = existingSnapshotKey.get(key);
        if (existingValue === undefined) snapshotsInserted++;
        else if (parseFloat(existingValue) !== value) snapshotsUpdated++;
        else snapshotsUnchanged++;

        return {
          assetId: existing.id,
          snapshotDate: row.snapshotDate,
          currentValue: value.toString(),
          source: "import" as const,
        };
      });

      if (values.length === 0) continue;

      await tx
        .insert(schema.assetValueSnapshots)
        .values(values)
        .onConflictDoUpdate({
          target: [schema.assetValueSnapshots.assetId, schema.assetValueSnapshots.snapshotDate],
          set: { currentValue: sql`excluded.current_value`, source: sql`excluded.source` },
        });
    }
  });

  console.log("");
  console.log(`Assets created: ${assetsCreated}`);
  console.log(`Balance records inserted: ${snapshotsInserted}`);
  console.log(`Balance records updated: ${snapshotsUpdated}`);
  console.log(`Balance records unchanged: ${snapshotsUnchanged}`);
  console.log("Apply complete. All changes committed in a single transaction.");
  process.exit(0);
}

// Only run when executed directly, not when imported by tests.
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error("IMPORT FAILED (rolled back, no partial writes):", error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
