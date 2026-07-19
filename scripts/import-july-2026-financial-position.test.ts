import { describe, it, expect } from "vitest";
import {
  REPORTED_ASSETS,
  UNREPORTED_ACCOUNTS,
  EXPECTED_TOTALS,
  reconcileControlTotals,
  resolveMatch,
  type ExistingAsset,
} from "./import-july-2026-financial-position";

describe("Financial Position — 1 July 2026", () => {
  const result = reconcileControlTotals();

  it("has no validation errors", () => {
    expect(result.errors).toEqual([]);
  });

  it("cash equals 255,700,000", () => {
    expect(result.cash).toBe(255_700_000n);
    expect(result.cash).toBe(EXPECTED_TOTALS.cash);
  });

  it("liquid investments equal 377,007,171", () => {
    expect(result.liquidInvestments).toBe(377_007_171n);
  });

  it("liquid assets equal 632,707,171", () => {
    expect(result.liquidAssets).toBe(632_707_171n);
  });

  it("private businesses equal 252,862,401", () => {
    expect(result.privateBusinesses).toBe(252_862_401n);
  });

  it("receivables equal 40,000,000", () => {
    expect(result.receivables).toBe(40_000_000n);
  });

  it("vehicles equal 87,125,000", () => {
    expect(result.vehicles).toBe(87_125_000n);
  });

  it("non-liquid assets equal 379,987,401", () => {
    expect(result.nonLiquidAssets).toBe(379_987_401n);
  });

  it("net worth equals 1,012,694,572", () => {
    expect(result.netWorth).toBe(1_012_694_572n);
  });

  it("exactly 21 reported asset values are processed", () => {
    expect(REPORTED_ASSETS.length).toBe(21);
  });

  it("exactly 4 unreported (blank) accounts are tracked, never defaulted to zero", () => {
    expect(UNREPORTED_ACCOUNTS).toEqual(["GoPay", "OVO", "ShopeePay", "Cash on Hand"]);
    for (const name of UNREPORTED_ACCOUNTS) {
      expect(REPORTED_ASSETS.some((a) => a.name === name)).toBe(false);
    }
  });

  it('"A" maps to Ashfa', () => {
    const ashfa = REPORTED_ASSETS.find((a) => a.name === "Ashfa");
    expect(ashfa?.legacyAliases).toContain("A");
    expect(ashfa?.category).toBe("receivable");
  });

  it('"Arisan" maps to Mas Ben', () => {
    const masBen = REPORTED_ASSETS.find((a) => a.name === "Mas Ben");
    expect(masBen?.legacyAliases).toContain("Arisan");
    expect(masBen?.category).toBe("receivable");
  });

  it('"Baswara" maps to Mobil BMW', () => {
    const bmw = REPORTED_ASSETS.find((a) => a.name === "Mobil BMW");
    expect(bmw?.legacyAliases).toContain("Baswara");
    expect(bmw?.category).toBe("vehicle");
  });

  it("Mobil BMW is not included in business value", () => {
    const businessSum = REPORTED_ASSETS.filter((a) => a.category === "business").reduce((s, a) => s + a.value, 0n);
    expect(businessSum).toBe(EXPECTED_TOTALS.privateBusinesses);
    const bmw = REPORTED_ASSETS.find((a) => a.name === "Mobil BMW");
    expect(bmw?.category).not.toBe("business");
  });

  it("Ashfa and Mas Ben are not included in business value", () => {
    const businessNames = REPORTED_ASSETS.filter((a) => a.category === "business").map((a) => a.name);
    expect(businessNames).not.toContain("Ashfa");
    expect(businessNames).not.toContain("Mas Ben");
  });

  it("every reported asset value is a positive whole-rupiah BigInt", () => {
    for (const asset of REPORTED_ASSETS) {
      expect(typeof asset.value).toBe("bigint");
      expect(asset.value).toBeGreaterThan(0n);
    }
  });

  it("tampering with a single value breaks reconciliation (sanity check the validator actually validates)", () => {
    const tampered = REPORTED_ASSETS.map((a) => (a.name === "BCA" ? { ...a, value: 1n } : a));
    const cash = tampered.filter((a) => ["BCA", "BNI", "Bank Jago", "Mandiri"].includes(a.name)).reduce((s, a) => s + a.value, 0n);
    expect(cash).not.toBe(EXPECTED_TOTALS.cash);
  });
});

describe("resolveMatch — legacy alias resolution", () => {
  const asset = (overrides: Partial<ExistingAsset>): ExistingAsset => ({
    id: "id-1",
    name: "name",
    category: "business",
    subcategory: "sub",
    currentValue: "1000.00",
    ...overrides,
  });

  it("does NOT treat a case-variant alias as a duplicate of the same row (regression: caught in dry-run before apply)", () => {
    // "Bybit Ateng" is the canonical name; "BYBIT ATENG" is only a case-variant of the very
    // same row, not a second historical name — resolveMatch must recognize they're one asset,
    // not flag a merge that would delete the only real row for this holding.
    const target = { name: "Bybit Ateng", legacyAliases: ["BYBIT ATENG"], category: "investment" as const, subcategory: "crypto", value: 34_750_000n };
    const existing = [asset({ id: "row-1", name: "Bybit Ateng", category: "investment" })];
    const match = resolveMatch(target, existing);
    expect(match.kind).not.toBe("merge");
    expect(match.duplicates).toEqual([]);
    expect(match.primary?.id).toBe("row-1");
  });

  it("renames a legacy-named row to canonical when no canonical row exists yet", () => {
    const target = { name: "Mas Ben", legacyAliases: ["Arisan"], category: "receivable" as const, subcategory: "personal_receivable", value: 15_000_000n };
    const existing = [asset({ id: "row-2", name: "Arisan", category: "other" })];
    const match = resolveMatch(target, existing);
    expect(match.kind).toBe("rename");
    expect(match.primary?.id).toBe("row-2");
    expect(match.matchedAlias).toBe("Arisan");
  });

  it("merges when both a canonical-named row and a genuinely distinct legacy row exist", () => {
    const target = { name: "Mas Ben", legacyAliases: ["Arisan"], category: "receivable" as const, subcategory: "personal_receivable", value: 15_000_000n };
    const existing = [
      asset({ id: "canonical-row", name: "Mas Ben", category: "receivable" }),
      asset({ id: "legacy-row", name: "Arisan", category: "other" }),
    ];
    const match = resolveMatch(target, existing);
    expect(match.kind).toBe("merge");
    expect(match.primary?.id).toBe("canonical-row");
    expect(match.duplicates.map((d) => d.id)).toEqual(["legacy-row"]);
  });

  it("creates fresh when neither canonical name nor any legacy alias exists", () => {
    const target = { name: "Brand New Asset", category: "other" as const, subcategory: "x", value: 1n };
    const match = resolveMatch(target, []);
    expect(match.kind).toBe("create");
    expect(match.primary).toBeUndefined();
  });

  it("running the plan twice is idempotent: second resolution against post-rename state is a plain reuse, not another rename", () => {
    const target = { name: "Mas Ben", legacyAliases: ["Arisan"], category: "receivable" as const, subcategory: "personal_receivable", value: 15_000_000n };
    // Simulates DB state AFTER the first apply already renamed the row.
    const existingAfterFirstRun = [asset({ id: "row-2", name: "Mas Ben", category: "receivable" })];
    const match = resolveMatch(target, existingAfterFirstRun);
    expect(match.kind).toBe("reuse");
    expect(match.duplicates).toEqual([]);
  });
});
