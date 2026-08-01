/**
 * One-time importer: Mandiri statement transactions for July 2026.
 *
 * Unlike BCA, there is no `bank_accounts` row for Mandiri yet — this script
 * creates one and links it to the existing "Mandiri" cash asset
 * (id b3a8685b-79d9-4a08-9d5b-6fd01c113675, currentValue 11,500,000 as of the
 * 2026-07-01 financial-position snapshot). The statement's own Opening
 * Balance (11,664,414) is more precise than that rounded snapshot — same
 * pattern seen on BCA — so this script seeds the ledger from the statement's
 * own opening figure, not the asset's current value.
 *
 * Money In 3,000,000 / Money Out 157,000 reconcile exactly against the raw
 * rows below; opening 11,664,414 + net 2,843,000 = ending 14,507,414, which
 * gets pushed onto the Mandiri asset via recomputeSnapshotForBankAccount.
 *
 * Usage:
 *   pnpm import:mandiri-jul-2026 -- --dry-run
 *   pnpm import:mandiri-jul-2026
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { and, eq } from "drizzle-orm";
import { getDb, schema } from "../lib/db/client";
import { computeDedupHash } from "../lib/statementImport/dedup";
import { recomputeSnapshotForBankAccount } from "../lib/finance/recomputeSnapshots";

const MANDIRI_ASSET_NAME = "Mandiri";

interface RawEntry {
  date: string;
  description: string;
  counterparty: string | null;
  categoryKey: string;
  moneyIn: number | null;
  moneyOut: number | null;
}

const RAW_ENTRIES: RawEntry[] = [
  { date: "2026-07-19", description: "Top Up e-money", counterparty: null, categoryKey: "transport_fuel", moneyIn: null, moneyOut: 50_000 },
  { date: "2026-07-19", description: "AXA Mandiri Group Shield Pro", counterparty: null, categoryKey: "insurance", moneyIn: null, moneyOut: 1_000 },
  { date: "2026-07-28", description: "Top Up e-money", counterparty: null, categoryKey: "transport_fuel", moneyIn: null, moneyOut: 100_000 },
  {
    date: "2026-07-31",
    description: "Transfer dari PT Bank ANZ Indonesia (PwC Consulting Indonesia PT)",
    counterparty: "PT Bank ANZ Indonesia (PwC Consulting Indonesia PT)",
    categoryKey: "salary",
    moneyIn: 3_000_000,
    moneyOut: null,
  },
  { date: "2026-07-31", description: "Biaya Administrasi Rekening", counterparty: null, categoryKey: "fees_charges", moneyIn: null, moneyOut: 6_000 },
];

const OPENING_BALANCE = 11_664_414;
const EXPECTED_FINAL_BALANCE = 14_507_414;
const SNAPSHOT_DATE = new Date("2026-07-31T00:00:00Z");

interface PreparedRow extends RawEntry {
  balanceAfter: number;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function prepareRows(entries: RawEntry[], opening: number): PreparedRow[] {
  let runningBalance = opening;
  return entries.map((entry) => {
    runningBalance += entry.moneyIn ?? 0;
    runningBalance -= entry.moneyOut ?? 0;
    return { ...entry, balanceAfter: round2(runningBalance) };
  });
}

async function main() {
  const isDryRun = process.argv.includes("--dry-run");

  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set (checked .env.local). Refusing to continue.");
  }

  const totalIn = round2(RAW_ENTRIES.reduce((sum, e) => sum + (e.moneyIn ?? 0), 0));
  const totalOut = round2(RAW_ENTRIES.reduce((sum, e) => sum + (e.moneyOut ?? 0), 0));
  if (totalIn !== 3_000_000) throw new Error(`Total money in ${totalIn} does not match statement's Money In 3,000,000 — aborting.`);
  if (totalOut !== 157_000) throw new Error(`Total money out ${totalOut} does not match statement's Money Out 157,000 — aborting.`);

  const rows = prepareRows(RAW_ENTRIES, OPENING_BALANCE);
  const finalBalance = rows[rows.length - 1].balanceAfter;
  if (finalBalance !== EXPECTED_FINAL_BALANCE) {
    throw new Error(`Computed final balance ${finalBalance} does not match expected ${EXPECTED_FINAL_BALANCE} — aborting.`);
  }

  const db = getDb();

  const [asset] = await db
    .select()
    .from(schema.assets)
    .where(and(eq(schema.assets.category, "cash"), eq(schema.assets.name, MANDIRI_ASSET_NAME)))
    .limit(1);
  if (!asset) throw new Error(`No cash asset named "${MANDIRI_ASSET_NAME}" found — refusing to create one implicitly.`);

  const existingMandiriBankAccounts = await db.select().from(schema.bankAccounts).where(eq(schema.bankAccounts.bankCode, "mandiri"));
  let bankAccountId = existingMandiriBankAccounts[0]?.id ?? null;
  let bankAccountCreated = false;
  const warnings: string[] = [];
  if (existingMandiriBankAccounts.length > 1) {
    warnings.push(`Found ${existingMandiriBankAccounts.length} bank_accounts with bank_code='mandiri' — using the first (id=${bankAccountId}).`);
  }

  const existingTxs = bankAccountId
    ? await db.select({ transactionDate: schema.transactions.transactionDate }).from(schema.transactions).where(eq(schema.transactions.bankAccountId, bankAccountId))
    : [];
  if (existingTxs.length > 0) {
    throw new Error(`Mandiri bank account ${bankAccountId} already has ${existingTxs.length} transactions — this script assumes a first-time import. Aborting.`);
  }

  const categories = await db.select().from(schema.categories);
  const categoryByKey = new Map(categories.map((c) => [c.key, c]));
  const missingKeys = [...new Set(RAW_ENTRIES.map((e) => e.categoryKey))].filter((k) => !categoryByKey.has(k));
  if (missingKeys.length > 0) throw new Error(`Category key(s) not found in DB: ${missingKeys.join(", ")}`);

  let insertedCount = 0;
  let skippedDuplicateCount = 0;

  if (isDryRun) {
    insertedCount = rows.length;
  } else {
    await db.transaction(async (tx) => {
      if (!bankAccountId) {
        const [created] = await tx
          .insert(schema.bankAccounts)
          .values({ bankCode: "mandiri", accountName: MANDIRI_ASSET_NAME, linkedAssetId: asset.id })
          .returning({ id: schema.bankAccounts.id });
        bankAccountId = created.id;
        bankAccountCreated = true;
      } else {
        const row = existingMandiriBankAccounts[0];
        if (!row.linkedAssetId) {
          await tx.update(schema.bankAccounts).set({ linkedAssetId: asset.id }).where(eq(schema.bankAccounts.id, bankAccountId));
        }
      }

      for (const row of rows) {
        const category = categoryByKey.get(row.categoryKey)!;
        const dedupHash = computeDedupHash({
          bankAccountId: bankAccountId!,
          transactionDate: row.date,
          moneyIn: row.moneyIn,
          moneyOut: row.moneyOut,
          balanceAfter: row.balanceAfter,
          description: row.description,
        });

        const [inserted] = await tx
          .insert(schema.transactions)
          .values({
            bankAccountId: bankAccountId!,
            transactionDate: row.date,
            description: row.description,
            counterparty: row.counterparty,
            moneyIn: row.moneyIn?.toString() ?? null,
            moneyOut: row.moneyOut?.toString() ?? null,
            balanceAfter: row.balanceAfter.toString(),
            categoryId: category.id,
            reviewedAt: new Date(),
            dedupHash,
          })
          .onConflictDoNothing({ target: [schema.transactions.bankAccountId, schema.transactions.dedupHash] })
          .returning({ id: schema.transactions.id });

        if (inserted) insertedCount++;
        else skippedDuplicateCount++;
      }
    });

    await recomputeSnapshotForBankAccount(bankAccountId!, finalBalance, SNAPSHOT_DATE);
  }

  console.log("");
  console.log(`Mode:                   ${isDryRun ? "DRY RUN (no writes)" : "LIVE"}`);
  console.log(`Mandiri bank account:   ${bankAccountId ?? "(would be created)"}${bankAccountCreated ? " (created)" : ""}`);
  console.log(`Entries to import:      ${rows.length}`);
  console.log(`Inserted:               ${insertedCount}`);
  console.log(`Skipped (duplicate):    ${skippedDuplicateCount}`);
  console.log(`Opening balance:        ${OPENING_BALANCE}`);
  console.log(`Computed final balance: ${finalBalance}`);
  console.log(`Wealth snapshot pushed: ${isDryRun ? "no (dry run)" : `yes, asOf ${SNAPSHOT_DATE.toISOString().slice(0, 10)}`}`);
  console.log("");
  if (warnings.length > 0) {
    console.log(`Warnings (${warnings.length}):`);
    for (const w of warnings) console.log(`  - ${w}`);
  } else {
    console.log("No warnings.");
  }
  console.log("");

  process.exit(0);
}

main().catch((error) => {
  console.error("IMPORT FAILED:", error instanceof Error ? error.message : error);
  process.exit(1);
});
