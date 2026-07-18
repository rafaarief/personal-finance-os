/**
 * One-time importer: BCA statement transactions for June 2026 into the
 * existing `transactions` table (reuses the same schema/dedup logic as the
 * app's own statement-import pipeline).
 *
 * Usage:
 *   pnpm import:bca-jun-2026 -- --dry-run   # parse + validate only, no DB writes
 *   pnpm import:bca-jun-2026                # actually write
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { and, eq } from "drizzle-orm";
import { getDb, schema } from "../lib/db/client";
import { computeDedupHash } from "../lib/statementImport/dedup";
import { recomputeSnapshotForBankAccount } from "../lib/finance/recomputeSnapshots";

// --- Config — edit here if the account matching guess is wrong ------------

/** How the BCA cash asset is identified/created if missing. */
const BCA_ASSET = { category: "cash" as const, subcategory: "BCA", name: "BCA" };

/**
 * There were 2 existing `bank_accounts` rows with bank_code='bca' when this
 * script was written (account holder name + account number), neither linked
 * to an asset. We use the oldest one and link it to the BCA asset. If that's
 * the wrong account, set this to a specific id to force it.
 */
const FORCE_BANK_ACCOUNT_ID: string | null = null;

// --- Input data --------------------------------------------------------------

type RawEntryType =
  | "opening_balance"
  | "debit"
  | "credit"
  | "transfer_out"
  | "transfer_in"
  | "fee"
  | "interest"
  | "tax";

interface RawEntry {
  date: string;
  type: RawEntryType;
  description: string;
  amount: number;
  balance?: number;
}

/** Outflow types reduce the running balance; inflow types increase it. */
const OUTFLOW_TYPES = new Set<RawEntryType>(["debit", "transfer_out", "fee", "tax"]);
const INFLOW_TYPES = new Set<RawEntryType>(["credit", "transfer_in", "interest"]);

const RAW_ENTRIES: RawEntry[] = [
  { date: "2026-06-01", type: "opening_balance", description: "Saldo Awal", amount: 285800171.74, balance: 285800171.74 },
  { date: "2026-06-01", type: "debit", description: "Biaya Admin", amount: 10000 },
  { date: "2026-06-02", type: "debit", description: "Flazz Top Up", amount: 100000 },
  { date: "2026-06-03", type: "debit", description: "QRIS Indomaret", amount: 9400 },
  { date: "2026-06-03", type: "debit", description: "QRIS Indomaret", amount: 66800 },
  { date: "2026-06-03", type: "debit", description: "Kartu Kredit", amount: 4062977 },
  { date: "2026-06-04", type: "transfer_out", description: "Transfer Nur Marfuah", amount: 3000000 },
  { date: "2026-06-04", type: "transfer_in", description: "Transfer Suci Alicia Tam", amount: 77227453 },
  { date: "2026-06-05", type: "transfer_out", description: "BI-FAST Mahmud Asrul", amount: 9000000 },
  { date: "2026-06-05", type: "fee", description: "BI-FAST Fee", amount: 2500 },
  { date: "2026-06-05", type: "transfer_out", description: "Transfer PT Perdana Bangun", amount: 39690000 },
  { date: "2026-06-06", type: "debit", description: "QR Sunset BRI", amount: 38000 },
  { date: "2026-06-06", type: "transfer_out", description: "BI-FAST Umar Izzuddin", amount: 2720000 },
  { date: "2026-06-06", type: "fee", description: "BI-FAST Fee", amount: 2500 },
  { date: "2026-06-06", type: "transfer_in", description: "Jonathan Emmanuel", amount: 140000 },
  { date: "2026-06-06", type: "transfer_in", description: "Nitanidiya", amount: 200000 },
  { date: "2026-06-07", type: "transfer_in", description: "Suci Alicia Tam", amount: 39690000 },
  { date: "2026-06-07", type: "transfer_in", description: "Darin Putra Bagaskara", amount: 700000 },
  { date: "2026-06-08", type: "transfer_in", description: "Jason Sebastian", amount: 119000 },
  { date: "2026-06-11", type: "transfer_in", description: "Suci Alicia Tam", amount: 125000000 },
  { date: "2026-06-12", type: "transfer_out", description: "Achmad Zaim Mudzaki", amount: 250000000 },
  { date: "2026-06-19", type: "transfer_in", description: "Darin Putra Bagaskara", amount: 400000 },
  { date: "2026-06-20", type: "debit", description: "Flazz Top Up", amount: 100000 },
  { date: "2026-06-22", type: "transfer_out", description: "Eka Febbyanti", amount: 2800000 },
  { date: "2026-06-22", type: "transfer_in", description: "Flip", amount: 314000 },
  { date: "2026-06-22", type: "transfer_in", description: "GoPay Bank Transfer", amount: 740000 },
  { date: "2026-06-22", type: "transfer_out", description: "Umar Izzuddin", amount: 50000000 },
  { date: "2026-06-22", type: "fee", description: "BI-FAST Fee", amount: 2500 },
  { date: "2026-06-24", type: "transfer_out", description: "Arum Laela Lathifa", amount: 3840000 },
  { date: "2026-06-24", type: "transfer_out", description: "Sri Ampeli", amount: 1900000 },
  { date: "2026-06-24", type: "transfer_out", description: "Regita Cahya Ramadhani", amount: 2400000 },
  { date: "2026-06-24", type: "transfer_out", description: "Camelina Gita", amount: 3300000 },
  { date: "2026-06-26", type: "transfer_in", description: "Suci Alicia Tam", amount: 20913136 },
  { date: "2026-06-26", type: "transfer_out", description: "Eka Febbyanti", amount: 11000000 },
  { date: "2026-06-26", type: "transfer_out", description: "Desty Ratna Sari", amount: 3000000 },
  { date: "2026-06-27", type: "transfer_in", description: "Darin Putra Bagaskara", amount: 384000 },
  { date: "2026-06-27", type: "debit", description: "Flazz Top Up", amount: 100000 },
  { date: "2026-06-30", type: "transfer_in", description: "Mohammad Rifqi", amount: 120000 },
  { date: "2026-06-30", type: "transfer_in", description: "Zharezky Yoga Pratama", amount: 108000 },
  { date: "2026-06-30", type: "interest", description: "Bunga", amount: 5827.2 },
  { date: "2026-06-30", type: "tax", description: "Pajak Bunga", amount: 1165.44 },
];

const EXPECTED_FINAL_BALANCE = 164715745.5;

// --- Row shaping ---------------------------------------------------------------

interface PreparedRow {
  date: string;
  description: string;
  moneyIn: number | null;
  moneyOut: number | null;
  balanceAfter: number;
}

function prepareRows(entries: RawEntry[]): { rows: PreparedRow[]; startingBalance: number } {
  const opening = entries.find((e) => e.type === "opening_balance");
  if (!opening || opening.balance === undefined) {
    throw new Error("No opening_balance entry with a balance found — cannot compute a running balance.");
  }

  let runningBalance = opening.balance;
  const rows: PreparedRow[] = [];

  for (const entry of entries) {
    if (entry.type === "opening_balance") continue; // seeds the walk, not a ledger row

    if (OUTFLOW_TYPES.has(entry.type)) {
      runningBalance -= entry.amount;
      rows.push({
        date: entry.date,
        description: entry.description,
        moneyIn: null,
        moneyOut: entry.amount,
        balanceAfter: runningBalance,
      });
    } else if (INFLOW_TYPES.has(entry.type)) {
      runningBalance += entry.amount;
      rows.push({
        date: entry.date,
        description: entry.description,
        moneyIn: entry.amount,
        moneyOut: null,
        balanceAfter: runningBalance,
      });
    } else {
      throw new Error(`Unknown entry type "${entry.type}" for "${entry.description}" on ${entry.date}`);
    }
  }

  return { rows, startingBalance: opening.balance };
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

async function main() {
  const isDryRun = process.argv.includes("--dry-run");

  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set (checked .env.local). Refusing to continue.");
  }

  const { rows, startingBalance } = prepareRows(RAW_ENTRIES);
  const finalBalance = round2(rows[rows.length - 1].balanceAfter);

  if (round2(finalBalance) !== round2(EXPECTED_FINAL_BALANCE)) {
    throw new Error(
      `Computed final balance ${finalBalance} does not match expected ${EXPECTED_FINAL_BALANCE} — refusing to import. Check the transaction data / direction mapping.`
    );
  }

  const db = getDb();

  // --- Find or create the BCA asset -----------------------------------------
  const [existingAsset] = await db
    .select()
    .from(schema.assets)
    .where(and(eq(schema.assets.category, BCA_ASSET.category), eq(schema.assets.name, BCA_ASSET.name)))
    .limit(1);

  let assetId = existingAsset?.id ?? null;
  let assetCreated = false;

  // --- Find or create the BCA bank account ------------------------------------
  const bcaBankAccounts = await db
    .select()
    .from(schema.bankAccounts)
    .where(eq(schema.bankAccounts.bankCode, "bca"))
    .orderBy(schema.bankAccounts.createdAt);

  let bankAccountId = FORCE_BANK_ACCOUNT_ID;
  let bankAccountCreated = false;
  const warnings: string[] = [];

  if (!bankAccountId) {
    if (bcaBankAccounts.length === 0) {
      bankAccountId = null; // created below, inside the write branch
    } else {
      bankAccountId = bcaBankAccounts[0].id;
      if (bcaBankAccounts.length > 1) {
        warnings.push(
          `Found ${bcaBankAccounts.length} bank_accounts with bank_code='bca' — using the oldest (id=${bankAccountId}, name="${bcaBankAccounts[0].accountName}"). Set FORCE_BANK_ACCOUNT_ID at the top of this script if that's the wrong one.`
        );
      }
    }
  }

  // --- Compute dedup + duplicate preview (works even in dry-run) -------------
  const existingHashes = bankAccountId
    ? new Set(
        (
          await db
            .select({ dedupHash: schema.transactions.dedupHash })
            .from(schema.transactions)
            .where(eq(schema.transactions.bankAccountId, bankAccountId))
        ).map((r) => r.dedupHash)
      )
    : new Set<string>();

  const rowsWithHash = rows.map((row) => ({
    ...row,
    dedupHash: computeDedupHash({
      bankAccountId: bankAccountId ?? "pending",
      transactionDate: row.date,
      moneyIn: row.moneyIn,
      moneyOut: row.moneyOut,
      balanceAfter: null, // matches the app's own dedup key: date+amounts+description (account+date+amount+description per spec); balanceAfter intentionally excluded here since bankAccountId is "pending" until the account exists
      description: row.description,
    }),
  }));

  const alreadyPresentCount = rowsWithHash.filter((r) => existingHashes.has(r.dedupHash)).length;
  const newCount = rowsWithHash.length - alreadyPresentCount;

  let insertedCount = 0;
  let skippedDuplicateCount = 0;

  if (isDryRun) {
    insertedCount = newCount;
    skippedDuplicateCount = alreadyPresentCount;
  } else {
    await db.transaction(async (tx) => {
      // Asset
      if (!assetId) {
        const [created] = await tx
          .insert(schema.assets)
          .values({
            category: BCA_ASSET.category,
            subcategory: BCA_ASSET.subcategory,
            name: BCA_ASSET.name,
            currentValue: startingBalance.toString(),
            currency: "IDR",
            notes: "Created by scripts/import-bca-jun-2026.ts",
            lastUpdatedAt: new Date(),
          })
          .returning({ id: schema.assets.id });
        assetId = created.id;
        assetCreated = true;
      }

      // Bank account
      if (!bankAccountId) {
        const [created] = await tx
          .insert(schema.bankAccounts)
          .values({
            bankCode: "bca",
            accountName: "BCA",
            linkedAssetId: assetId,
          })
          .returning({ id: schema.bankAccounts.id });
        bankAccountId = created.id;
        bankAccountCreated = true;
      } else {
        const currentRow = bcaBankAccounts.find((a) => a.id === bankAccountId);
        if (currentRow && !currentRow.linkedAssetId && assetId) {
          await tx.update(schema.bankAccounts).set({ linkedAssetId: assetId }).where(eq(schema.bankAccounts.id, bankAccountId));
        }
      }

      // Transactions — recompute hashes now that bankAccountId is final
      for (const row of rows) {
        const dedupHash = computeDedupHash({
          bankAccountId: bankAccountId!,
          transactionDate: row.date,
          moneyIn: row.moneyIn,
          moneyOut: row.moneyOut,
          balanceAfter: null,
          description: row.description,
        });

        const [inserted] = await tx
          .insert(schema.transactions)
          .values({
            bankAccountId: bankAccountId!,
            transactionDate: row.date,
            description: row.description,
            moneyIn: row.moneyIn?.toString() ?? null,
            moneyOut: row.moneyOut?.toString() ?? null,
            balanceAfter: row.balanceAfter.toString(),
            reviewedAt: new Date(),
            dedupHash,
          })
          .onConflictDoNothing({ target: [schema.transactions.bankAccountId, schema.transactions.dedupHash] })
          .returning({ id: schema.transactions.id });

        if (inserted) insertedCount++;
        else skippedDuplicateCount++;
      }
    });

    // Outside the transaction, same pattern as lib/actions/imports.ts:
    // push the final known balance onto the linked asset + snapshot.
    await recomputeSnapshotForBankAccount(bankAccountId!, finalBalance, new Date("2026-06-30T00:00:00Z"));
  }

  console.log("");
  console.log(`Mode:                  ${isDryRun ? "DRY RUN (no writes)" : "LIVE"}`);
  console.log(`BCA asset:             ${assetId ?? "(would be created)"}${assetCreated ? " (created)" : ""}`);
  console.log(`BCA bank account:      ${bankAccountId ?? "(would be created)"}${bankAccountCreated ? " (created)" : ""}`);
  console.log(`Entries parsed:        ${RAW_ENTRIES.length} (1 opening-balance line used to seed the running balance, not imported as a transaction)`);
  console.log(`Transactions to import: ${rows.length}`);
  console.log(`Inserted:              ${insertedCount}`);
  console.log(`Skipped (duplicate):   ${skippedDuplicateCount}`);
  console.log(`Starting balance:      ${startingBalance}`);
  console.log(`Computed final balance: ${finalBalance} (expected ${EXPECTED_FINAL_BALANCE}) ✓`);
  console.log("");
  if (warnings.length > 0) {
    console.log(`Warnings (${warnings.length}):`);
    for (const warning of warnings) console.log(`  - ${warning}`);
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
