/**
 * June 2026 closing statement (as of 2026-07-01) — idempotent import/reconciliation.
 *
 * IMPORTANT CONTEXT discovered during inspection: this exact statement's data
 * was already imported into production earlier (via
 * scripts/import-accounting-calculation.ts, which covered the whole historical
 * workbook including this closing row). Running this script therefore mostly
 * *confirms* already-correct data rather than writing fresh rows — except
 * `assets.current_value` for BCA, which was stale (last set by a June-2026
 * transaction import that predates this statement). This script is still the
 * canonical, re-runnable source of truth for this statement: safe to run
 * again any time, will only ever touch what's actually different.
 *
 * Usage:
 *   pnpm finance:import:june-2026 --dry-run
 *   pnpm finance:import:june-2026 --apply
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { and, eq } from "drizzle-orm";
import { getDb, schema } from "../lib/db/client";

const SNAPSHOT_DATE = "2026-07-01";
const PREVIOUS_SNAPSHOT_DATE = "2026-06-04"; // read-only reference, never written

type Category = "cash" | "investment" | "business" | "other";

interface TargetAsset {
  /** Canonical display name to match/create by. */
  name: string;
  /** Known aliases this holding may already exist under in the DB (checked in order). */
  aliases?: string[];
  category: Category;
  subcategory: string;
  balance: number;
}

// --- Canonical target dataset (June 2026 closing, as of 2026-07-01) --------

export const LIQUID_TARGETS: TargetAsset[] = [
  { name: "BCA", category: "cash", subcategory: "BCA", balance: 213_000_000 },
  { name: "BNI", category: "cash", subcategory: "BNI", balance: 1_200_000 },
  { name: "Bank Jago", aliases: ["Jago"], category: "cash", subcategory: "Jago", balance: 30_000_000 },
  { name: "Mandiri", category: "cash", subcategory: "Mandiri", balance: 11_500_000 },
  { name: "Narin Capital", aliases: ["Narin"], category: "investment", subcategory: "Narin Capital", balance: 50_000_000 },
  { name: "Bitget", category: "investment", subcategory: "Bitget", balance: 90_000_000 },
  { name: "Stockbit", category: "investment", subcategory: "Stockbit", balance: 145_671_142 },
  { name: "Pintu", category: "investment", subcategory: "Pintu", balance: 17_240_446 },
  { name: "Bybit Ateng", category: "investment", subcategory: "Bybit", balance: 34_750_000 },
  { name: "Reku Spot", category: "investment", subcategory: "Reku", balance: 5_088_412 },
  { name: "Reku US", category: "investment", subcategory: "Reku", balance: 26_257_171 },
  { name: "Pluang", category: "investment", subcategory: "Pluang", balance: 8_000_000 },
];

export const NON_LIQUID_TARGETS: TargetAsset[] = [
  { name: "PWN", category: "business", subcategory: "PWN", balance: 125_000_000 },
  {
    // Spec's "A" is category=other (Business Value / Other Value targets below only
    // reconcile with Ashfa classified as other) — the existing DB row had drifted to
    // category=business (a manual UI edit after the ambiguous original import). This
    // script corrects the category back to match the statement's classification.
    name: "Ashfa",
    aliases: ["A"],
    category: "other",
    subcategory: "Ashfa",
    balance: 25_000_000,
  },
  { name: "Arisan", category: "other", subcategory: "Receivable", balance: 15_000_000 },
  { name: "Baswara", category: "business", subcategory: "Baswara", balance: 87_125_000 },
  { name: "BoothyCall", aliases: ["boothycall"], category: "business", subcategory: "BoothyCall", balance: 75_349_401 },
  { name: "BreadWinner", aliases: ["Breadwinner"], category: "business", subcategory: "Breadwinner", balance: 20_513_000 },
  { name: "Sundrip", category: "business", subcategory: "Sundrip", balance: 6_000_000 },
  { name: "TENS", category: "business", subcategory: "TENS", balance: 12_000_000 },
  { name: "BoothyCall Analog", aliases: ["Analog"], category: "business", subcategory: "Analog", balance: 14_000_000 },
];

/**
 * These accounts appeared blank in the July 1 statement. Per spec: preserve
 * the existing asset record untouched, record NO snapshot for 2026-07-01,
 * never zero the balance, never delete. This list exists purely for
 * reporting — the script takes no write action on these at all.
 */
const BLANK_ACCOUNT_NAMES = ["GoPay", "OVO", "ShopeePay", "Cash on Hand"];

export const EXPECTED_LIQUID_TOTAL = 632_707_171;
export const EXPECTED_NON_LIQUID_TOTAL = 379_987_401;
export const EXPECTED_TOTAL = 1_012_694_572;

export function assertReconciles() {
  const liquidSum = LIQUID_TARGETS.reduce((sum, a) => sum + a.balance, 0);
  const nonLiquidSum = NON_LIQUID_TARGETS.reduce((sum, a) => sum + a.balance, 0);
  const total = liquidSum + nonLiquidSum;

  const errors: string[] = [];
  if (liquidSum !== EXPECTED_LIQUID_TOTAL) {
    errors.push(`Liquid total ${liquidSum} does not match expected ${EXPECTED_LIQUID_TOTAL}`);
  }
  if (nonLiquidSum !== EXPECTED_NON_LIQUID_TOTAL) {
    errors.push(`Non-liquid total ${nonLiquidSum} does not match expected ${EXPECTED_NON_LIQUID_TOTAL}`);
  }
  if (total !== EXPECTED_TOTAL) {
    errors.push(`Total ${total} does not match expected ${EXPECTED_TOTAL}`);
  }
  if (errors.length > 0) {
    throw new Error(`Source statement failed self-reconciliation, aborting:\n${errors.join("\n")}`);
  }

  return { liquidSum, nonLiquidSum, total };
}

interface ExistingAsset {
  id: string;
  name: string;
  category: string;
  subcategory: string;
  currentValue: string;
}

function findExisting(target: TargetAsset, existing: ExistingAsset[]): ExistingAsset | undefined {
  const candidates = [target.name, ...(target.aliases ?? [])].map((n) => n.toLowerCase());
  return existing.find((a) => candidates.includes(a.name.toLowerCase()));
}

async function main() {
  const isDryRun = process.argv.includes("--dry-run");
  const isApply = process.argv.includes("--apply");
  if (!isDryRun && !isApply) {
    throw new Error("Specify --dry-run or --apply");
  }

  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set (checked .env.local). Refusing to continue.");
  }

  // 1. Source statement must be internally self-consistent before touching the DB at all.
  const { liquidSum, nonLiquidSum, total } = assertReconciles();

  const db = getDb();
  const allTargets = [...LIQUID_TARGETS, ...NON_LIQUID_TARGETS];

  const existingAssets = await db
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

  // Read-only reference for reporting the snapshot-to-snapshot change (never written to).
  const previousSnapshotRows = await db
    .select({ currentValue: schema.assetValueSnapshots.currentValue })
    .from(schema.assetValueSnapshots)
    .where(eq(schema.assetValueSnapshots.snapshotDate, PREVIOUS_SNAPSHOT_DATE));
  const previousTotal = previousSnapshotRows.reduce((sum, r) => sum + parseFloat(r.currentValue), 0);

  interface PlannedChange {
    target: TargetAsset;
    existing: ExistingAsset | undefined;
    assetAction: "create" | "update_value" | "update_classification" | "unchanged";
    snapshotAction: "insert" | "update" | "unchanged";
  }

  const plan: PlannedChange[] = allTargets.map((target) => {
    const existing = findExisting(target, existingAssets);
    let assetAction: PlannedChange["assetAction"] = "unchanged";
    let snapshotAction: PlannedChange["snapshotAction"] = "insert";

    if (!existing) {
      assetAction = "create";
      snapshotAction = "insert";
    } else {
      const currentValue = parseFloat(existing.currentValue);
      const valueDiffers = currentValue !== target.balance;
      const classificationDiffers = existing.category !== target.category || existing.subcategory !== target.subcategory;

      if (valueDiffers && classificationDiffers) assetAction = "update_value"; // value update also carries classification fix
      else if (valueDiffers) assetAction = "update_value";
      else if (classificationDiffers) assetAction = "update_classification";
      else assetAction = "unchanged";

      const existingSnapshotValue = existingSnapshotByAssetId.get(existing.id);
      if (existingSnapshotValue === undefined) snapshotAction = "insert";
      else snapshotAction = parseFloat(existingSnapshotValue) !== target.balance ? "update" : "unchanged";
    }

    return { target, existing, assetAction, snapshotAction };
  });

  // --- Report (backup/export of what will change, printed before any write) ---
  console.log("");
  console.log(`Mode: ${isDryRun ? "DRY RUN (no writes)" : "APPLY"}`);
  console.log(`Snapshot date: ${SNAPSHOT_DATE} (June 2026 closing statement)`);
  console.log(`Previous snapshot (read-only reference): ${PREVIOUS_SNAPSHOT_DATE}, total ${previousTotal}`);
  console.log("");
  console.log("Source statement self-reconciliation: PASS");
  console.log(`  liquid ${liquidSum} + non-liquid ${nonLiquidSum} = ${total}`);
  console.log("");
  console.log(`Snapshot change vs ${PREVIOUS_SNAPSHOT_DATE}: ${total - previousTotal} (using actual DB total for the previous snapshot, not a hardcoded figure)`);
  console.log("");

  console.log("Planned changes:");
  for (const change of plan) {
    console.log(
      `  ${change.target.name.padEnd(20)} asset=${change.assetAction.padEnd(12)} snapshot=${change.snapshotAction.padEnd(10)}` +
        (change.existing ? ` (matched existing id=${change.existing.id}, was ${change.existing.currentValue})` : " (no existing match — will create)")
    );
  }

  console.log("");
  console.log("Blank/unreported accounts — left completely untouched (no value change, no snapshot):");
  for (const name of BLANK_ACCOUNT_NAMES) {
    const existing = existingAssets.find((a) => a.name.toLowerCase() === name.toLowerCase());
    console.log(`  ${name.padEnd(20)} ${existing ? `preserved at ${existing.currentValue}` : "(no existing asset — nothing to preserve)"}`);
  }

  const created = plan.filter((c) => c.assetAction === "create").length;
  const valueUpdated = plan.filter((c) => c.assetAction === "update_value").length;
  const classificationUpdated = plan.filter((c) => c.assetAction === "update_classification").length;
  const assetUnchanged = plan.filter((c) => c.assetAction === "unchanged").length;
  const snapshotsInserted = plan.filter((c) => c.snapshotAction === "insert").length;
  const snapshotsUpdated = plan.filter((c) => c.snapshotAction === "update").length;
  const snapshotsUnchanged = plan.filter((c) => c.snapshotAction === "unchanged").length;

  console.log("");
  console.log(`Assets to create: ${created}`);
  console.log(`Assets to update (current_value): ${valueUpdated}`);
  console.log(`Assets to update (category/subcategory only): ${classificationUpdated}`);
  console.log(`Assets unchanged: ${assetUnchanged}`);
  console.log(`Snapshots to insert: ${snapshotsInserted}`);
  console.log(`Snapshots to update: ${snapshotsUpdated}`);
  console.log(`Snapshots unchanged: ${snapshotsUnchanged}`);
  console.log("");

  if (isDryRun) {
    console.log("Dry run complete — no writes performed.");
    process.exit(0);
  }

  // --- Apply, inside one transaction; any failure rolls back everything ---
  await db.transaction(async (tx) => {
    for (const change of plan) {
      let assetId = change.existing?.id;

      if (change.assetAction === "create") {
        const [createdRow] = await tx
          .insert(schema.assets)
          .values({
            category: change.target.category,
            subcategory: change.target.subcategory,
            name: change.target.name,
            currentValue: change.target.balance.toString(),
            currency: "IDR",
            notes: "Created by scripts/import-june-2026-closing.ts",
            lastUpdatedAt: new Date(),
          })
          .returning({ id: schema.assets.id });
        assetId = createdRow.id;
      } else if (change.assetAction === "update_value") {
        await tx
          .update(schema.assets)
          .set({
            currentValue: change.target.balance.toString(),
            category: change.target.category,
            subcategory: change.target.subcategory,
            lastUpdatedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(schema.assets.id, assetId!));
      } else if (change.assetAction === "update_classification") {
        await tx
          .update(schema.assets)
          .set({ category: change.target.category, subcategory: change.target.subcategory, updatedAt: new Date() })
          .where(eq(schema.assets.id, assetId!));
      }

      await tx
        .insert(schema.assetValueSnapshots)
        .values({
          assetId: assetId!,
          snapshotDate: SNAPSHOT_DATE,
          currentValue: change.target.balance.toString(),
          source: "import",
        })
        .onConflictDoUpdate({
          target: [schema.assetValueSnapshots.assetId, schema.assetValueSnapshots.snapshotDate],
          set: { currentValue: change.target.balance.toString(), source: "import" },
        });
    }
  });

  console.log("Apply complete. All changes committed in a single transaction.");
  process.exit(0);
}

// Only run when executed directly (`tsx scripts/import-june-2026-closing.ts`), not when
// imported by tests — main() reads DATABASE_URL/process.argv and calls process.exit().
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error("IMPORT FAILED (rolled back, no partial writes):", error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
