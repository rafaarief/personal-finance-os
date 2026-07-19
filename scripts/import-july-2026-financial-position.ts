/**
 * Financial Position — 1 July 2026 (June 2026 closing), balance-sheet snapshot.
 *
 * IMPORTANT CONTEXT discovered during inspection: the 21 reported balances
 * below were already written to the 2026-07-01 snapshot by
 * scripts/import-june-2026-closing.ts. This script's real job here is the
 * classification correction that script deliberately left for later: "Ashfa"
 * and the then-unrenamed "Arisan"/"Baswara" rows were bucketed as
 * category=other / category=business so that script's OWN control totals
 * (Business Value / Other Value) would reconcile — but those buckets don't
 * distinguish receivables and vehicles from real operating businesses. This
 * script:
 *   1. Renames legacy rows "Arisan" -> "Mas Ben" and "Baswara" -> "Mobil BMW"
 *      (both already-canonical "Ashfa" needs no rename, only reclassification).
 *   2. Reclassifies Ashfa + Mas Ben to category=receivable, Mobil BMW to
 *      category=vehicle (previously other/business respectively) — so Mobil
 *      BMW no longer inflates Business Value, and receivables get their own
 *      dashboard slice instead of hiding in "Other".
 *   3. Confirms (idempotently) all 21 reported balances for 2026-07-01.
 *
 * All money math for validation runs in BigInt — every reported figure here
 * is a whole-rupiah integer, so this is exact, not a floating-point
 * approximation. Postgres's numeric(16,2) column still takes a decimal
 * string at the write boundary, converted right at that boundary only.
 *
 * This is a balance-sheet snapshot, not a transaction import: no income,
 * expense, transfer, or gain/loss rows are ever created by this script.
 *
 * Usage:
 *   pnpm finance:import:july-2026 --dry-run   (default if no flag given)
 *   pnpm finance:import:july-2026 --apply
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { eq } from "drizzle-orm";
import { getDb, schema } from "../lib/db/client";

const SNAPSHOT_DATE = "2026-07-01";

type Category = "cash" | "investment" | "business" | "other" | "receivable" | "vehicle";

const LIQUID_CATEGORIES = new Set<Category>(["cash", "investment"]);

interface CanonicalAsset {
  /** Canonical display name — matches the live dashboard's asset.name going forward. */
  name: string;
  /** Prior name(s) this holding may exist under in the DB today. Checked if no canonical match. */
  legacyAliases?: string[];
  category: Category;
  subcategory: string;
  value: bigint;
}

// --- Canonical target dataset (21 reported balances, 1 July 2026) ----------

export const REPORTED_ASSETS: CanonicalAsset[] = [
  // Liquid cash
  { name: "BCA", category: "cash", subcategory: "bank_account", value: 213_000_000n },
  { name: "BNI", category: "cash", subcategory: "bank_account", value: 1_200_000n },
  { name: "Bank Jago", legacyAliases: ["Jago"], category: "cash", subcategory: "bank_account", value: 30_000_000n },
  { name: "Mandiri", category: "cash", subcategory: "bank_account", value: 11_500_000n },
  // Liquid investments
  { name: "Narin Capital", legacyAliases: ["Narin", "NARIN"], category: "investment", subcategory: "managed_investment", value: 50_000_000n },
  { name: "Bitget", category: "investment", subcategory: "crypto", value: 90_000_000n },
  { name: "Stockbit", category: "investment", subcategory: "public_equity", value: 145_671_142n },
  { name: "Pintu", category: "investment", subcategory: "crypto", value: 17_240_446n },
  { name: "Bybit Ateng", legacyAliases: ["BYBIT ATENG"], category: "investment", subcategory: "crypto", value: 34_750_000n },
  { name: "Reku Spot", legacyAliases: ["REKU SPOT"], category: "investment", subcategory: "crypto", value: 5_088_412n },
  { name: "Reku US", legacyAliases: ["REKU US"], category: "investment", subcategory: "public_equity", value: 26_257_171n },
  { name: "Pluang", category: "investment", subcategory: "multi_asset_investment", value: 8_000_000n },
  // Private businesses (non-liquid)
  { name: "PWN", category: "business", subcategory: "private_business_investment", value: 125_000_000n },
  { name: "BoothyCall", legacyAliases: ["boothycall"], category: "business", subcategory: "private_business", value: 75_349_401n },
  { name: "BreadWinner", legacyAliases: ["Breadwinner"], category: "business", subcategory: "private_business", value: 20_513_000n },
  { name: "Sundrip", category: "business", subcategory: "private_business", value: 6_000_000n },
  { name: "TENS", category: "business", subcategory: "private_business", value: 12_000_000n },
  { name: "BoothyCall Analog", legacyAliases: ["Analog"], category: "business", subcategory: "private_business", value: 14_000_000n },
  // Receivables and vehicle (non-liquid, previously miscategorized as other/business)
  { name: "Ashfa", legacyAliases: ["A"], category: "receivable", subcategory: "personal_receivable", value: 25_000_000n },
  { name: "Mas Ben", legacyAliases: ["Arisan"], category: "receivable", subcategory: "personal_receivable", value: 15_000_000n },
  { name: "Mobil BMW", legacyAliases: ["Baswara", "BMW"], category: "vehicle", subcategory: "car", value: 87_125_000n },
];

/**
 * These asset accounts exist in the DB but had no reported balance in this
 * statement. Per spec: preserve the asset record, take no write action of any
 * kind on it (no snapshot insert, no zeroing, no carrying forward). Purely
 * reported here for dry-run visibility.
 */
export const UNREPORTED_ACCOUNTS = ["GoPay", "OVO", "ShopeePay", "Cash on Hand"];

const CASH_NAMES = new Set(["BCA", "BNI", "Bank Jago", "Mandiri"]);
const LIQUID_INVESTMENT_NAMES = new Set([
  "Narin Capital",
  "Bitget",
  "Stockbit",
  "Pintu",
  "Bybit Ateng",
  "Reku Spot",
  "Reku US",
  "Pluang",
]);
const PRIVATE_BUSINESS_NAMES = new Set(["PWN", "BoothyCall", "BreadWinner", "Sundrip", "TENS", "BoothyCall Analog"]);
const RECEIVABLE_NAMES = new Set(["Ashfa", "Mas Ben"]);
const VEHICLE_NAMES = new Set(["Mobil BMW"]);

export const EXPECTED_TOTALS = {
  cash: 255_700_000n,
  liquidInvestments: 377_007_171n,
  liquidAssets: 632_707_171n,
  privateBusinesses: 252_862_401n,
  receivables: 40_000_000n,
  vehicles: 87_125_000n,
  nonLiquidAssets: 379_987_401n,
  netWorth: 1_012_694_572n,
} as const;

function sumBy(names: Set<string>): bigint {
  return REPORTED_ASSETS.filter((a) => names.has(a.name)).reduce((sum, a) => sum + a.value, 0n);
}

export interface ReconciliationResult {
  cash: bigint;
  liquidInvestments: bigint;
  liquidAssets: bigint;
  privateBusinesses: bigint;
  receivables: bigint;
  vehicles: bigint;
  nonLiquidAssets: bigint;
  netWorth: bigint;
  errors: string[];
}

/** Pure, DB-free control-total check — must pass before any database access is even attempted. */
export function reconcileControlTotals(): ReconciliationResult {
  const cash = sumBy(CASH_NAMES);
  const liquidInvestments = sumBy(LIQUID_INVESTMENT_NAMES);
  const liquidAssets = cash + liquidInvestments;
  const privateBusinesses = sumBy(PRIVATE_BUSINESS_NAMES);
  const receivables = sumBy(RECEIVABLE_NAMES);
  const vehicles = sumBy(VEHICLE_NAMES);
  const nonLiquidAssets = privateBusinesses + receivables + vehicles;
  const netWorth = liquidAssets + nonLiquidAssets;

  const errors: string[] = [];
  const check = (label: string, actual: bigint, expected: bigint) => {
    if (actual !== expected) errors.push(`${label}: calculated ${actual} does not match expected ${expected}`);
  };
  check("Cash position", cash, EXPECTED_TOTALS.cash);
  check("Liquid investments", liquidInvestments, EXPECTED_TOTALS.liquidInvestments);
  check("Liquid assets", liquidAssets, EXPECTED_TOTALS.liquidAssets);
  check("Private businesses", privateBusinesses, EXPECTED_TOTALS.privateBusinesses);
  check("Receivables", receivables, EXPECTED_TOTALS.receivables);
  check("Vehicles", vehicles, EXPECTED_TOTALS.vehicles);
  check("Non-liquid assets", nonLiquidAssets, EXPECTED_TOTALS.nonLiquidAssets);
  check("Net worth", netWorth, EXPECTED_TOTALS.netWorth);
  // Also confirm every target has a category consistent with the bucket it's summed into.
  const allNamedSets = [CASH_NAMES, LIQUID_INVESTMENT_NAMES, PRIVATE_BUSINESS_NAMES, RECEIVABLE_NAMES, VEHICLE_NAMES];
  for (const target of REPORTED_ASSETS) {
    const inSets = allNamedSets.filter((set) => set.has(target.name)).length;
    if (inSets !== 1) errors.push(`${target.name}: must appear in exactly one control-total bucket, found in ${inSets}`);
  }
  if (REPORTED_ASSETS.length !== 21) {
    errors.push(`Expected exactly 21 reported assets, found ${REPORTED_ASSETS.length}`);
  }

  return { cash, liquidInvestments, liquidAssets, privateBusinesses, receivables, vehicles, nonLiquidAssets, netWorth, errors };
}

function isLiquid(category: Category): boolean {
  return LIQUID_CATEGORIES.has(category);
}

function fmtIDR(value: bigint): string {
  return `Rp${value.toLocaleString("id-ID")}`;
}

/** Postgres numeric(16,2) values are always whole rupiah in this dataset — safe exact round-trip. */
function toBigIntRupiah(numericString: string): bigint {
  return BigInt(Math.round(Number(numericString)));
}

export interface ExistingAsset {
  id: string;
  name: string;
  category: string;
  subcategory: string;
  currentValue: string;
}

export type MatchKind = "reuse" | "rename" | "merge" | "create";

export interface ResolvedMatch {
  kind: MatchKind;
  /** The asset row that will end up representing this canonical target (existing id, or undefined if creating). */
  primary: ExistingAsset | undefined;
  /** Any other existing rows (matched via legacy alias while a canonical-named row ALSO already exists) to merge into `primary` and delete. */
  duplicates: ExistingAsset[];
  matchedAlias?: string;
}

export function resolveMatch(target: CanonicalAsset, existingAssets: ExistingAsset[]): ResolvedMatch {
  const canonical = existingAssets.find((a) => a.name.toLowerCase() === target.name.toLowerCase());
  const legacyMatches = (target.legacyAliases ?? [])
    .map((alias) => ({ alias, row: existingAssets.find((a) => a.name.toLowerCase() === alias.toLowerCase()) }))
    // An alias that case-insensitively equals the canonical name resolves to the SAME row as
    // `canonical` (e.g. alias "BYBIT ATENG" vs canonical "Bybit Ateng") — that's one asset, not a
    // duplicate to merge. Only a genuinely distinct row (different id) counts as a legacy match.
    .filter((m): m is { alias: string; row: ExistingAsset } => m.row !== undefined && m.row.id !== canonical?.id);

  if (canonical && legacyMatches.length > 0) {
    return { kind: "merge", primary: canonical, duplicates: legacyMatches.map((m) => m.row), matchedAlias: legacyMatches[0].alias };
  }
  if (canonical) {
    return { kind: "reuse", primary: canonical, duplicates: [] };
  }
  if (legacyMatches.length > 0) {
    // First alias match becomes the renamed primary; any further alias matches (unlikely) are merged into it.
    const [first, ...rest] = legacyMatches;
    return { kind: "rename", primary: first.row, duplicates: rest.map((m) => m.row), matchedAlias: first.alias };
  }
  return { kind: "create", primary: undefined, duplicates: [] };
}

interface PlannedChange {
  target: CanonicalAsset;
  match: ResolvedMatch;
  assetAction: "create" | "rename" | "merge" | "update_value" | "update_classification" | "unchanged";
  snapshotAction: "insert" | "update" | "unchanged";
  currentDbValue: bigint | null;
}

function parseArgs() {
  const args = process.argv.slice(2);
  const isApply = args.includes("--apply");
  const isDryRun = args.includes("--dry-run") || !isApply; // default dry-run
  return { isDryRun, isApply };
}

async function main() {
  const { isDryRun, isApply } = parseArgs();

  // --- 1. Source self-reconciliation — must pass before any DB access at all. ---
  const reconciliation = reconcileControlTotals();

  console.log("");
  console.log(`Mode: ${isDryRun ? "DRY RUN (no writes)" : "APPLY"}`);
  console.log("Snapshot date: 2026-07-01 (Financial Position — 1 July 2026 / June 2026 closing)");
  console.log("Statement type: asset_balance_snapshot (balance sheet, not a transaction import)");
  console.log("");
  console.log("Control totals (calculated from the 21 reported asset values, BigInt arithmetic):");
  console.log(`  Cash Position:        ${fmtIDR(reconciliation.cash)}`);
  console.log(`  Liquid Investments:   ${fmtIDR(reconciliation.liquidInvestments)}`);
  console.log(`  Liquid Assets:        ${fmtIDR(reconciliation.liquidAssets)}`);
  console.log(`  Private Businesses:   ${fmtIDR(reconciliation.privateBusinesses)}`);
  console.log(`  Receivables:          ${fmtIDR(reconciliation.receivables)}`);
  console.log(`  Vehicles:             ${fmtIDR(reconciliation.vehicles)}`);
  console.log(`  Non-Liquid Assets:    ${fmtIDR(reconciliation.nonLiquidAssets)}`);
  console.log(`  Net Worth:            ${fmtIDR(reconciliation.netWorth)}`);
  console.log("");
  console.log(`Validation Errors: ${reconciliation.errors.length}`);
  for (const err of reconciliation.errors) console.log(`  ERROR: ${err}`);

  if (reconciliation.errors.length > 0) {
    console.log("");
    console.log("Control totals failed to reconcile exactly — aborting before touching the database.");
    process.exit(1);
  }

  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set (checked .env.local). Refusing to continue.");
  }

  const db = getDb();

  console.log("");
  console.log("Database environment: connected (host/credentials not printed).");

  // --- 2. Diff against the DB -------------------------------------------------
  const existingAssets: ExistingAsset[] = await db
    .select({
      id: schema.assets.id,
      name: schema.assets.name,
      category: schema.assets.category,
      subcategory: schema.assets.subcategory,
      currentValue: schema.assets.currentValue,
    })
    .from(schema.assets);

  const existingSnapshots = await db
    .select({ assetId: schema.assetValueSnapshots.assetId, currentValue: schema.assetValueSnapshots.currentValue })
    .from(schema.assetValueSnapshots)
    .where(eq(schema.assetValueSnapshots.snapshotDate, SNAPSHOT_DATE));
  const existingSnapshotByAssetId = new Map(existingSnapshots.map((s) => [s.assetId, s.currentValue]));

  const plan: PlannedChange[] = REPORTED_ASSETS.map((target) => {
    const match = resolveMatch(target, existingAssets);

    if (match.kind === "create") {
      return { target, match, assetAction: "create", snapshotAction: "insert", currentDbValue: null };
    }

    const primary = match.primary!;
    const currentDbValue = toBigIntRupiah(primary.currentValue);
    const valueDiffers = currentDbValue !== target.value;
    const classificationDiffers = primary.category !== target.category || primary.subcategory !== target.subcategory;
    const nameDiffers = primary.name !== target.name;

    let assetAction: PlannedChange["assetAction"];
    if (match.kind === "merge") assetAction = "merge";
    else if (match.kind === "rename" || nameDiffers) assetAction = "rename";
    else if (valueDiffers) assetAction = "update_value";
    else if (classificationDiffers) assetAction = "update_classification";
    else assetAction = "unchanged";

    const existingSnapshotValue = existingSnapshotByAssetId.get(primary.id);
    const snapshotAction: PlannedChange["snapshotAction"] =
      existingSnapshotValue === undefined
        ? "insert"
        : toBigIntRupiah(existingSnapshotValue) !== target.value
          ? "update"
          : "unchanged";

    return { target, match, assetAction, snapshotAction, currentDbValue };
  });

  // --- 3. Reconciliation / plan report ----------------------------------------
  console.log("");
  console.log("Reconciliation table:");
  console.log(
    "name".padEnd(20),
    "alias".padEnd(10),
    "asset_id".padEnd(38),
    "category".padEnd(11),
    "liquidity".padEnd(11),
    "db_value".padStart(14),
    "source_value".padStart(14),
    "diff".padStart(12),
    "operation"
  );
  for (const change of plan) {
    const liquidity = isLiquid(change.target.category) ? "liquid" : "non_liquid";
    const diff = change.currentDbValue !== null ? change.target.value - change.currentDbValue : change.target.value;
    console.log(
      change.target.name.padEnd(20),
      (change.match.matchedAlias ?? "—").padEnd(10),
      (change.match.primary?.id ?? "(new)").padEnd(38),
      change.target.category.padEnd(11),
      liquidity.padEnd(11),
      (change.currentDbValue !== null ? change.currentDbValue.toString() : "—").padStart(14),
      change.target.value.toString().padStart(14),
      diff.toString().padStart(12),
      `asset=${change.assetAction} snapshot=${change.snapshotAction}`
    );
    if (change.match.duplicates.length > 0) {
      for (const dup of change.match.duplicates) {
        console.log(`    -> will merge + delete duplicate row: id=${dup.id} name="${dup.name}" value=${dup.currentValue}`);
      }
    }
  }

  console.log("");
  console.log("Unreported accounts — left completely untouched (no snapshot written, no value changed):");
  for (const name of UNREPORTED_ACCOUNTS) {
    const existing = existingAssets.find((a) => a.name.toLowerCase() === name.toLowerCase());
    console.log(`  ${name.padEnd(20)} ${existing ? `preserved at ${existing.currentValue}` : "(no existing asset record found)"}`);
  }

  const created = plan.filter((c) => c.assetAction === "create").length;
  const renamed = plan.filter((c) => c.assetAction === "rename").length;
  const merged = plan.filter((c) => c.assetAction === "merge").length;
  const valueUpdated = plan.filter((c) => c.assetAction === "update_value").length;
  const classificationUpdated = plan.filter((c) => c.assetAction === "update_classification").length;
  const reused = plan.filter((c) => c.assetAction === "unchanged").length;
  const snapshotsInserted = plan.filter((c) => c.snapshotAction === "insert").length;
  const snapshotsUpdated = plan.filter((c) => c.snapshotAction === "update").length;
  const snapshotsUnchanged = plan.filter((c) => c.snapshotAction === "unchanged").length;

  console.log("");
  console.log(`Assets to create: ${created}`);
  console.log(`Assets to rename (legacy alias -> canonical): ${renamed}`);
  console.log(`Assets to merge (duplicate canonical + legacy rows): ${merged}`);
  console.log(`Assets to update (value): ${valueUpdated}`);
  console.log(`Assets to update (category/subcategory only): ${classificationUpdated}`);
  console.log(`Assets reused unchanged: ${reused}`);
  console.log(`Balances to insert: ${snapshotsInserted}`);
  console.log(`Balances to update: ${snapshotsUpdated}`);
  console.log(`Balances unchanged: ${snapshotsUnchanged}`);
  console.log("");
  console.log(`Apply mode permitted: ${isApply ? "yes (--apply passed, validation clean)" : "no (dry-run — pass --apply to write)"}`);

  if (isDryRun) {
    console.log("");
    console.log("Dry run complete — no writes performed.");
    process.exit(0);
  }

  // --- 4. Apply, inside one transaction; any failure rolls back everything ---
  await db.transaction(async (tx) => {
    for (const change of plan) {
      let assetId: string;

      if (change.assetAction === "create") {
        const [createdRow] = await tx
          .insert(schema.assets)
          .values({
            category: change.target.category,
            subcategory: change.target.subcategory,
            name: change.target.name,
            currentValue: change.target.value.toString(),
            currency: "IDR",
            notes: "Created by scripts/import-july-2026-financial-position.ts",
            lastUpdatedAt: new Date(`${SNAPSHOT_DATE}T00:00:00Z`),
          })
          .returning({ id: schema.assets.id });
        assetId = createdRow.id;
      } else if (change.assetAction === "merge") {
        const primary = change.match.primary!;
        assetId = primary.id;

        for (const dup of change.match.duplicates) {
          const dupSnapshots = await tx
            .select({ snapshotDate: schema.assetValueSnapshots.snapshotDate, currentValue: schema.assetValueSnapshots.currentValue, source: schema.assetValueSnapshots.source })
            .from(schema.assetValueSnapshots)
            .where(eq(schema.assetValueSnapshots.assetId, dup.id));

          for (const snap of dupSnapshots) {
            await tx
              .insert(schema.assetValueSnapshots)
              .values({ assetId, snapshotDate: snap.snapshotDate, currentValue: snap.currentValue, source: snap.source })
              .onConflictDoNothing({ target: [schema.assetValueSnapshots.assetId, schema.assetValueSnapshots.snapshotDate] });
          }
          await tx.delete(schema.assetValueSnapshots).where(eq(schema.assetValueSnapshots.assetId, dup.id));
          await tx.update(schema.bankAccounts).set({ linkedAssetId: assetId }).where(eq(schema.bankAccounts.linkedAssetId, dup.id));
          await tx.delete(schema.assets).where(eq(schema.assets.id, dup.id));
        }

        await tx
          .update(schema.assets)
          .set({
            name: change.target.name,
            category: change.target.category,
            subcategory: change.target.subcategory,
            currentValue: change.target.value.toString(),
            notes: `Merged from "${change.match.matchedAlias}" by scripts/import-july-2026-financial-position.ts`,
            lastUpdatedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(schema.assets.id, assetId));
      } else if (change.assetAction === "rename") {
        assetId = change.match.primary!.id;
        await tx
          .update(schema.assets)
          .set({
            name: change.target.name,
            category: change.target.category,
            subcategory: change.target.subcategory,
            currentValue: change.target.value.toString(),
            notes: `Renamed from "${change.match.matchedAlias}" by scripts/import-july-2026-financial-position.ts`,
            lastUpdatedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(schema.assets.id, assetId));
      } else if (change.assetAction === "update_value") {
        assetId = change.match.primary!.id;
        await tx
          .update(schema.assets)
          .set({
            currentValue: change.target.value.toString(),
            category: change.target.category,
            subcategory: change.target.subcategory,
            lastUpdatedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(schema.assets.id, assetId));
      } else if (change.assetAction === "update_classification") {
        assetId = change.match.primary!.id;
        await tx
          .update(schema.assets)
          .set({ category: change.target.category, subcategory: change.target.subcategory, updatedAt: new Date() })
          .where(eq(schema.assets.id, assetId));
      } else {
        assetId = change.match.primary!.id;
      }

      await tx
        .insert(schema.assetValueSnapshots)
        .values({
          assetId,
          snapshotDate: SNAPSHOT_DATE,
          currentValue: change.target.value.toString(),
          source: "import",
        })
        .onConflictDoUpdate({
          target: [schema.assetValueSnapshots.assetId, schema.assetValueSnapshots.snapshotDate],
          set: { currentValue: change.target.value.toString(), source: "import" },
        });
    }
  });

  console.log("");
  console.log("Apply complete. All changes committed in a single transaction.");
  process.exit(0);
}

// Only run when executed directly (`tsx scripts/import-july-2026-financial-position.ts`),
// never when imported by tests — main() reads DATABASE_URL/process.argv and calls process.exit().
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error("IMPORT FAILED (rolled back, no partial writes):", error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
