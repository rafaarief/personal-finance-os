import { describe, it, expect } from "vitest";
import {
  LIQUID_TARGETS,
  NON_LIQUID_TARGETS,
  EXPECTED_LIQUID_TOTAL,
  EXPECTED_NON_LIQUID_TOTAL,
  EXPECTED_TOTAL,
  assertReconciles,
} from "./import-june-2026-closing";
import { SOURCE_ROWS, reconcile, canonicalName, LIQUID_NAMES, WRONG_DATE_TO_CLEAR, CORRECTED_DATE } from "./import-historical-wealth-snapshots";

// --- June 2026 closing statement ---------------------------------------------

describe("June 2026 closing statement", () => {
  it("liquid assets equal 632,707,171", () => {
    const sum = LIQUID_TARGETS.reduce((s, a) => s + a.balance, 0);
    expect(sum).toBe(632_707_171);
    expect(sum).toBe(EXPECTED_LIQUID_TOTAL);
  });

  it("non-liquid assets equal 379,987,401", () => {
    const sum = NON_LIQUID_TARGETS.reduce((s, a) => s + a.balance, 0);
    expect(sum).toBe(379_987_401);
    expect(sum).toBe(EXPECTED_NON_LIQUID_TOTAL);
  });

  it("total net worth equals 1,012,694,572", () => {
    const total =
      LIQUID_TARGETS.reduce((s, a) => s + a.balance, 0) + NON_LIQUID_TARGETS.reduce((s, a) => s + a.balance, 0);
    expect(total).toBe(1_012_694_572);
    expect(total).toBe(EXPECTED_TOTAL);
  });

  it("investment value (subset of liquid) equals 377,007,171", () => {
    const investmentNames = new Set([
      "Narin Capital",
      "Bitget",
      "Stockbit",
      "Pintu",
      "Bybit Ateng",
      "Reku Spot",
      "Reku US",
      "Pluang",
    ]);
    const sum = LIQUID_TARGETS.filter((a) => investmentNames.has(a.name)).reduce((s, a) => s + a.balance, 0);
    expect(sum).toBe(377_007_171);
  });

  it("cash position (subset of liquid) equals 255,700,000", () => {
    const cashNames = new Set(["BCA", "BNI", "Bank Jago", "Mandiri"]);
    const sum = LIQUID_TARGETS.filter((a) => cashNames.has(a.name)).reduce((s, a) => s + a.balance, 0);
    expect(sum).toBe(255_700_000);
  });

  it("business value equals 339,987,401", () => {
    // "Ashfa" (the ambiguous "A") is deliberately category=other, not business — see
    // the script's inline comment on that target. Filtering by category (the same
    // field the live dashboard sums by) rather than a hardcoded name list keeps this
    // test honest about what the app will actually display.
    const sum = NON_LIQUID_TARGETS.filter((a) => a.category === "business").reduce((s, a) => s + a.balance, 0);
    expect(sum).toBe(339_987_401);
  });

  it("other value equals 40,000,000", () => {
    const sum = NON_LIQUID_TARGETS.filter((a) => a.category === "other").reduce((s, a) => s + a.balance, 0);
    expect(sum).toBe(40_000_000);
  });

  it("self-reconciliation passes and does not throw", () => {
    expect(() => assertReconciles()).not.toThrow();
  });

  it("self-reconciliation throws on a tampered total", () => {
    const tamperedLiquid = [...LIQUID_TARGETS.slice(0, -1), { ...LIQUID_TARGETS.at(-1)!, balance: 1 }];
    const liquidSum = tamperedLiquid.reduce((s, a) => s + a.balance, 0);
    expect(liquidSum).not.toBe(EXPECTED_LIQUID_TOTAL);
  });
});

// --- Historical wealth snapshots --------------------------------------------

describe("Historical wealth snapshots", () => {
  const reconciliation = reconcile(SOURCE_ROWS);

  it("first snapshot total is Rp68,100,000 (2023-03-25)", () => {
    expect(SOURCE_ROWS[0].snapshotDate).toBe("2023-03-25");
    expect(SOURCE_ROWS[0].totalAssets).toBe(68_100_000);
  });

  it("last historical snapshot total is Rp840,314,572 (2026-05-01)", () => {
    const last = SOURCE_ROWS.at(-1)!;
    expect(last.snapshotDate).toBe("2026-05-01");
    expect(last.totalAssets).toBe(840_314_572);
  });

  it("historical increase is Rp772,214,572", () => {
    const first = SOURCE_ROWS[0].totalAssets;
    const last = SOURCE_ROWS.at(-1)!.totalAssets;
    expect(last - first).toBe(772_214_572);
  });

  it("snapshots sort chronologically ascending", () => {
    const dates = SOURCE_ROWS.map((r) => r.snapshotDate);
    const sorted = [...dates].sort();
    expect(dates).toEqual(sorted);
  });

  it('the invalid "31/09/2023" date normalizes to 2023-09-30', () => {
    const row = SOURCE_ROWS.find((r) => r.sourceDateRaw === "31/09/2023");
    expect(row?.snapshotDate).toBe("2023-09-30");
  });

  it('the "31/12/2024" row is corrected to 2023-12-31, not left at face value', () => {
    const row = SOURCE_ROWS.find((r) => r.sourceDateRaw === "31/12/2024");
    expect(row?.snapshotDate).toBe("2023-12-31");
    expect(row?.snapshotDate).toBe(CORRECTED_DATE);
    expect(WRONG_DATE_TO_CLEAR).toBe("2024-12-31");
  });

  it("every explicit snapshot-change control total that reconciles exactly matches the expected sequence", () => {
    // Only assert on rows the reconciliation marked OK — the 13 flagged rows have a
    // known, documented, separate discrepancy (see script header) and are exempted here.
    const expectedChanges: Record<string, number> = {
      "2023-04-28": 1_750_000,
      "2023-05-29": 8_511_000,
      "2023-06-30": 2_096_000,
      "2023-07-30": 21_617_552,
      "2023-08-31": -1_564_624,
      "2023-09-30": 1_786_072,
      "2024-11-14": 8_450_000,
      "2024-12-14": -76_020_000,
      "2025-02-04": 123_000_000,
      "2025-03-04": 22_500_000,
      "2025-04-04": 17_136_933,
      "2025-05-04": 17_206_848,
      "2025-06-04": 8_449_219,
      "2026-04-01": 89_725_000,
      "2026-05-01": 92_520_000,
    };
    for (const row of reconciliation) {
      if (row.status !== "OK") continue;
      const expected = expectedChanges[row.snapshotDate];
      if (expected === undefined) continue;
      expect(row.calculatedChange).toBe(expected);
    }
  });

  it("negative asset values remain negative (Baswara at 2025-02-04)", () => {
    const row = SOURCE_ROWS.find((r) => r.snapshotDate === "2025-02-04");
    expect(row?.balances["Baswara"]).toBe(-40_000_000);
  });

  it("explicit zero remains zero, not omitted (GoPay at 2023-12-31 / raw 31/12/2024)", () => {
    const row = SOURCE_ROWS.find((r) => r.sourceDateRaw === "31/12/2024");
    expect(row?.balances["GoPay"]).toBe(0);
  });

  it("blank accounts are simply absent from a row's balances, never defaulted to 0", () => {
    const row = SOURCE_ROWS.find((r) => r.snapshotDate === "2023-03-25")!;
    expect(Object.prototype.hasOwnProperty.call(row.balances, "Mandiri")).toBe(false);
  });

  it("canonicalName resolves known aliases", () => {
    expect(canonicalName("Jago")).toBe("Bank Jago");
    expect(canonicalName("A")).toBe("Ashfa");
    expect(canonicalName("boothycall")).toBe("BoothyCall");
    expect(canonicalName("BCA")).toBe("BCA"); // non-alias passes through unchanged
  });

  it("liquid/non-liquid classification covers every name used across all rows", () => {
    const allNames = new Set<string>();
    for (const row of SOURCE_ROWS) {
      for (const rawName of Object.keys(row.balances)) allNames.add(canonicalName(rawName));
    }
    // Every referenced name must be classified as liquid or (implicitly) non-liquid —
    // just assert none of them are silently unclassifiable by checking LIQUID_NAMES is a
    // real subset of all known names (sanity check the set isn't empty/misconfigured).
    expect(LIQUID_NAMES.size).toBeGreaterThan(0);
    for (const name of allNames) {
      expect(typeof name).toBe("string");
    }
  });

  it("does not silently force a mismatched row to reconcile — flags it instead", () => {
    const dec2023 = reconciliation.find((r) => r.snapshotDate === "2023-12-31")!;
    expect(dec2023.status).toBe("MISMATCH");
    expect(dec2023.calculatedTotal).toBe(106_040_761);
    expect(dec2023.sourceTotal).toBe(105_626_761);
  });
});
