/**
 * One-time importer: BCA statement transactions for July 2026 into the
 * existing `transactions` table (continues the running balance seeded by
 * scripts/import-bca-jun-2026.ts), plus a wealth snapshot push for the BCA
 * cash asset via recomputeSnapshotForBankAccount.
 *
 * Source: user-provided "JULY 2026 CASHFLOW" statement summary. Money In
 * 497,587,138 / Money Out 352,904,618 reconcile exactly against the raw rows
 * below; Opening Cash 164,715,745 matches (to rounding) the June-closing
 * balance already in the ledger (164,715,745.50, from the June import), and
 * the computed ending balance matches (to rounding) the statement's reported
 * "Ending Cash (BCA Wealth)" of 309,398,266 — see EXPECTED_FINAL_BALANCE.
 *
 * Three categories referenced by this statement don't exist yet in this
 * app's taxonomy (payroll, credit_card_payment, tax as first-class expense
 * categories) — this script creates them idempotently (matching the user's
 * own suggested PFOS category structure) before importing.
 *
 * "Internal Transfer"-labeled rows are only flagged isInternalTransfer=true
 * when the counterparty is "Own Account" (unambiguous same-owner movement).
 * The Umar rows (in: 670,600 + 633,218, out: 40,000,000) are labeled
 * "Internal Transfer" in the source but move money to/from a named person,
 * not a same-owner account, so they're kept as real cash movement
 * (isInternalTransfer=false) — flagged for the user to correct if wrong.
 *
 * Usage:
 *   pnpm import:bca-jul-2026 -- --dry-run   # parse + validate only, no DB writes
 *   pnpm import:bca-jul-2026                # actually write
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { and, eq } from "drizzle-orm";
import { getDb, schema } from "../lib/db/client";
import { computeDedupHash } from "../lib/statementImport/dedup";
import { recomputeSnapshotForBankAccount } from "../lib/finance/recomputeSnapshots";

// --- New categories this statement needs but the seed taxonomy lacks -------

const NEW_CATEGORIES: { key: string; label: string; kind: "income" | "expense" | "transfer" }[] = [
  { key: "payroll", label: "Payroll", kind: "expense" },
  { key: "credit_card_payment", label: "Credit Card Payment", kind: "expense" },
  { key: "tax", label: "Tax", kind: "expense" },
];

// --- Input data --------------------------------------------------------------

interface RawEntry {
  date: string;
  description: string;
  counterparty: string;
  categoryKey: string;
  moneyIn: number | null;
  moneyOut: number | null;
  isBusiness?: boolean;
  isInvestment?: boolean;
  isInternalTransfer?: boolean;
}

const RAW_ENTRIES: RawEntry[] = [
  // -- 01 Jul --
  { date: "2026-07-01", description: "Project payment", counterparty: "Suci Alicia Tam", categoryKey: "business_income", moneyIn: 86_792_988, moneyOut: null },
  { date: "2026-07-01", description: "Transfer", counterparty: "Muhammad Rizky", categoryKey: "other_income", moneyIn: 265_500, moneyOut: null },
  { date: "2026-07-01", description: "Transfer", counterparty: "Darin", categoryKey: "other_income", moneyIn: 600_000, moneyOut: null },
  { date: "2026-07-01", description: "Transfer", counterparty: "Mahmud Asrul", categoryKey: "business_income", moneyIn: 314_000, moneyOut: null },
  { date: "2026-07-01", description: "Transfer", counterparty: "Fauzan Firzandy", categoryKey: "business_income", moneyIn: 448_000, moneyOut: null },
  { date: "2026-07-01", description: "USD Auto Credit", counterparty: "IBKR / USD Conversion", categoryKey: "investment_income", moneyIn: 706_336, moneyOut: null, isInvestment: true },
  { date: "2026-07-01", description: "Transfer", counterparty: "Umar", categoryKey: "internal_transfer", moneyIn: null, moneyOut: 40_000_000 },
  { date: "2026-07-01", description: "BI Fast Fee", counterparty: "BCA", categoryKey: "fees_charges", moneyIn: null, moneyOut: 2_500 },
  { date: "2026-07-01", description: "Credit Card", counterparty: "BCA", categoryKey: "credit_card_payment", moneyIn: null, moneyOut: 2_769_784 },
  // -- 02 Jul --
  { date: "2026-07-02", description: "Monthly Admin", counterparty: "BCA", categoryKey: "fees_charges", moneyIn: null, moneyOut: 10_000 },
  // -- 03 Jul --
  { date: "2026-07-03", description: "Transfer", counterparty: "Darin", categoryKey: "other_income", moneyIn: 1_200_000, moneyOut: null },
  // -- 04 Jul --
  { date: "2026-07-04", description: "Transfer", counterparty: "Nur Marfuah", categoryKey: "business_expense", moneyIn: null, moneyOut: 4_000_000, isBusiness: true },
  { date: "2026-07-04", description: "Credit Card", counterparty: "BCA", categoryKey: "credit_card_payment", moneyIn: null, moneyOut: 1_202_460 },
  // -- 06 Jul --
  { date: "2026-07-06", description: "Transfer", counterparty: "Own Account", categoryKey: "internal_transfer", moneyIn: null, moneyOut: 202_000_000, isInternalTransfer: true },
  // -- 07 Jul --
  { date: "2026-07-07", description: "Transfer antar rekening", counterparty: "Own Account", categoryKey: "internal_transfer", moneyIn: 1_871_269, moneyOut: null, isInternalTransfer: true },
  { date: "2026-07-07", description: "Transfer", counterparty: "Own Account", categoryKey: "internal_transfer", moneyIn: null, moneyOut: 2_000_000, isInternalTransfer: true },
  // -- 08 Jul --
  { date: "2026-07-08", description: "Transfer antar rekening", counterparty: "Own Account", categoryKey: "internal_transfer", moneyIn: 100_791_616, moneyOut: null, isInternalTransfer: true },
  // -- 09 Jul --
  { date: "2026-07-09", description: "Transfer antar rekening", counterparty: "Own Account", categoryKey: "internal_transfer", moneyIn: 1_000_000, moneyOut: null, isInternalTransfer: true },
  { date: "2026-07-09", description: "Transfer antar rekening", counterparty: "Own Account", categoryKey: "internal_transfer", moneyIn: 1_005_002, moneyOut: null, isInternalTransfer: true },
  { date: "2026-07-09", description: "Transfer", counterparty: "Rakha", categoryKey: "other_income", moneyIn: 253_000, moneyOut: null },
  { date: "2026-07-09", description: "Transfer antar rekening", counterparty: "Own Account", categoryKey: "internal_transfer", moneyIn: 108_477_000, moneyOut: null, isInternalTransfer: true },
  // -- 10 Jul --
  { date: "2026-07-10", description: "Transfer", counterparty: "Vianza", categoryKey: "business_income", moneyIn: 125_000, moneyOut: null },
  // -- 11 Jul --
  { date: "2026-07-11", description: "Credit Card", counterparty: "BCA", categoryKey: "credit_card_payment", moneyIn: null, moneyOut: 3_000_000 },
  // -- 13 Jul --
  { date: "2026-07-13", description: "Credit Card", counterparty: "BCA", categoryKey: "credit_card_payment", moneyIn: null, moneyOut: 2_769_784 },
  { date: "2026-07-13", description: "Transfer", counterparty: "Eka Febbyanti", categoryKey: "business_expense", moneyIn: null, moneyOut: 8_000_000, isBusiness: true },
  { date: "2026-07-13", description: "Transfer", counterparty: "Heryani", categoryKey: "business_expense", moneyIn: null, moneyOut: 400_000, isBusiness: true },
  // -- 16 Jul --
  { date: "2026-07-16", description: "Flazz Topup", counterparty: "Flazz", categoryKey: "transport_fuel", moneyIn: null, moneyOut: 100_000 },
  // -- 19 Jul --
  { date: "2026-07-19", description: "Transfer", counterparty: "Annisa", categoryKey: "business_income", moneyIn: 275_000, moneyOut: null },
  // -- 22 Jul --
  { date: "2026-07-22", description: "Transfer", counterparty: "Unknown 5155098", categoryKey: "business_income", moneyIn: 27_982_684, moneyOut: null },
  // -- 24 Jul --
  { date: "2026-07-24", description: "Transfer", counterparty: "PT Perdana Bangun", categoryKey: "business_expense", moneyIn: null, moneyOut: 39_690_000, isBusiness: true },
  // -- 25 Jul --
  { date: "2026-07-25", description: "Project payment", counterparty: "Suci Alicia Tam", categoryKey: "business_income", moneyIn: 31_800_000, moneyOut: null },
  { date: "2026-07-25", description: "Reimbursement", counterparty: "Suci Alicia Tam", categoryKey: "business_income", moneyIn: 1_500_000, moneyOut: null },
  { date: "2026-07-25", description: "Project payment", counterparty: "Suci Alicia Tam", categoryKey: "business_income", moneyIn: 21_880_555, moneyOut: null },
  { date: "2026-07-25", description: "Transfer", counterparty: "Umar", categoryKey: "internal_transfer", moneyIn: 670_600, moneyOut: null },
  { date: "2026-07-25", description: "Transfer", counterparty: "Umar", categoryKey: "internal_transfer", moneyIn: 633_218, moneyOut: null },
  { date: "2026-07-25", description: "Transfer", counterparty: "Nita Nidiya", categoryKey: "other_income", moneyIn: 75_000, moneyOut: null },
  { date: "2026-07-25", description: "Credit Card", counterparty: "BCA", categoryKey: "credit_card_payment", moneyIn: null, moneyOut: 5_598_075 },
  { date: "2026-07-25", description: "Transfer", counterparty: "Nadira", categoryKey: "payroll", moneyIn: null, moneyOut: 2_500_000, isBusiness: true },
  { date: "2026-07-25", description: "BI Fast Fee", counterparty: "BCA", categoryKey: "fees_charges", moneyIn: null, moneyOut: 2_500 },
  { date: "2026-07-25", description: "Transfer", counterparty: "Regita", categoryKey: "payroll", moneyIn: null, moneyOut: 2_800_000, isBusiness: true },
  { date: "2026-07-25", description: "Transfer", counterparty: "Carlyn", categoryKey: "payroll", moneyIn: null, moneyOut: 1_500_000, isBusiness: true },
  { date: "2026-07-25", description: "Transfer", counterparty: "Binar", categoryKey: "payroll", moneyIn: null, moneyOut: 6_000_000, isBusiness: true },
  { date: "2026-07-25", description: "Transfer", counterparty: "Salman", categoryKey: "payroll", moneyIn: null, moneyOut: 5_000_000, isBusiness: true },
  { date: "2026-07-25", description: "Transfer", counterparty: "Fahri", categoryKey: "payroll", moneyIn: null, moneyOut: 3_000_000, isBusiness: true },
  { date: "2026-07-25", description: "Transfer", counterparty: "Calista", categoryKey: "payroll", moneyIn: null, moneyOut: 1_500_000, isBusiness: true },
  { date: "2026-07-25", description: "BI Fast Fee", counterparty: "BCA", categoryKey: "fees_charges", moneyIn: null, moneyOut: 2_500 },
  { date: "2026-07-25", description: "Transfer", counterparty: "Arva", categoryKey: "payroll", moneyIn: null, moneyOut: 1_500_000, isBusiness: true },
  { date: "2026-07-25", description: "BI Fast Fee", counterparty: "BCA", categoryKey: "fees_charges", moneyIn: null, moneyOut: 2_500 },
  { date: "2026-07-25", description: "Transfer", counterparty: "Amelia", categoryKey: "payroll", moneyIn: null, moneyOut: 4_000_000, isBusiness: true },
  { date: "2026-07-25", description: "BI Fast Fee", counterparty: "BCA", categoryKey: "fees_charges", moneyIn: null, moneyOut: 2_500 },
  { date: "2026-07-25", description: "Transfer", counterparty: "Lyrra", categoryKey: "payroll", moneyIn: null, moneyOut: 1_500_000, isBusiness: true },
  // -- 26 Jul --
  { date: "2026-07-26", description: "Credit Card", counterparty: "BCA", categoryKey: "credit_card_payment", moneyIn: null, moneyOut: 500_000 },
  // -- 27 Jul --
  { date: "2026-07-27", description: "Transfer", counterparty: "Annisa", categoryKey: "business_income", moneyIn: 230_000, moneyOut: null },
  { date: "2026-07-27", description: "Transfer", counterparty: "Nikola", categoryKey: "payroll", moneyIn: null, moneyOut: 2_500_000, isBusiness: true },
  { date: "2026-07-27", description: "Transfer", counterparty: "Filigonia", categoryKey: "payroll", moneyIn: null, moneyOut: 1_500_000, isBusiness: true },
  { date: "2026-07-27", description: "Credit Card", counterparty: "BCA", categoryKey: "credit_card_payment", moneyIn: null, moneyOut: 500_000 },
  // -- 28 Jul --
  { date: "2026-07-28", description: "Project payment", counterparty: "Suci Alicia Tam", categoryKey: "business_income", moneyIn: 108_530_295, moneyOut: null },
  // -- 30 Jul --
  { date: "2026-07-30", description: "Transfer", counterparty: "Rakha", categoryKey: "other_income", moneyIn: 155_000, moneyOut: null },
  { date: "2026-07-30", description: "Credit Card", counterparty: "BCA", categoryKey: "credit_card_payment", moneyIn: null, moneyOut: 1_000_000 },
  { date: "2026-07-30", description: "Tokopedia", counterparty: "Tokopedia", categoryKey: "business_expense", moneyIn: null, moneyOut: 6_051_000, isBusiness: true },
  // -- 31 Jul --
  { date: "2026-07-31", description: "Interest", counterparty: "BCA", categoryKey: "investment_income", moneyIn: 5_075, moneyOut: null, isInvestment: true },
  { date: "2026-07-31", description: "Interest Tax", counterparty: "BCA", categoryKey: "tax", moneyIn: null, moneyOut: 1_015 },
];

const OPENING_BALANCE = 164_715_745.5; // = last transaction's balanceAfter from the June import (2026-06-30)
const EXPECTED_FINAL_BALANCE = 309_398_265.5; // opening + (497,587,138 - 352,904,618); statement rounds this to 309,398,266
const SNAPSHOT_DATE = new Date("2026-07-31T00:00:00Z");

// --- Row shaping ---------------------------------------------------------------

interface PreparedRow extends RawEntry {
  balanceAfter: number;
}

function prepareRows(entries: RawEntry[], opening: number): PreparedRow[] {
  let runningBalance = opening;
  return entries.map((entry) => {
    if (entry.moneyIn !== null && entry.moneyOut !== null) {
      throw new Error(`Entry on ${entry.date} ("${entry.description}") has both moneyIn and moneyOut set`);
    }
    if (entry.moneyIn === null && entry.moneyOut === null) {
      throw new Error(`Entry on ${entry.date} ("${entry.description}") has neither moneyIn nor moneyOut set`);
    }
    runningBalance += entry.moneyIn ?? 0;
    runningBalance -= entry.moneyOut ?? 0;
    return { ...entry, balanceAfter: round2(runningBalance) };
  });
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

async function main() {
  const isDryRun = process.argv.includes("--dry-run");

  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set (checked .env.local). Refusing to continue.");
  }

  const totalIn = round2(RAW_ENTRIES.reduce((sum, e) => sum + (e.moneyIn ?? 0), 0));
  const totalOut = round2(RAW_ENTRIES.reduce((sum, e) => sum + (e.moneyOut ?? 0), 0));
  if (totalIn !== 497_587_138) throw new Error(`Total money in ${totalIn} does not match statement's Money In 497,587,138 — aborting.`);
  if (totalOut !== 352_904_618) throw new Error(`Total money out ${totalOut} does not match statement's Money Out 352,904,618 — aborting.`);

  const rows = prepareRows(RAW_ENTRIES, OPENING_BALANCE);
  const finalBalance = rows[rows.length - 1].balanceAfter;
  if (finalBalance !== EXPECTED_FINAL_BALANCE) {
    throw new Error(`Computed final balance ${finalBalance} does not match expected ${EXPECTED_FINAL_BALANCE} — aborting.`);
  }

  const db = getDb();

  // --- Locate the BCA bank account (same selection rule as the June script) --
  const bcaBankAccounts = await db
    .select()
    .from(schema.bankAccounts)
    .where(eq(schema.bankAccounts.bankCode, "bca"))
    .orderBy(schema.bankAccounts.createdAt);

  if (bcaBankAccounts.length === 0) {
    throw new Error("No bank_accounts row with bank_code='bca' found — expected the one created by import-bca-jun-2026.ts.");
  }
  const bankAccountId = bcaBankAccounts[0].id;
  const warnings: string[] = [];
  if (bcaBankAccounts.length > 1) {
    warnings.push(`Found ${bcaBankAccounts.length} bank_accounts with bank_code='bca' — using the oldest (id=${bankAccountId}).`);
  }
  if (!bcaBankAccounts[0].linkedAssetId) {
    warnings.push(`Chosen bank account ${bankAccountId} has no linkedAssetId — the wealth snapshot push will be a no-op.`);
  }

  // --- Continuity check: some existing transaction must carry exactly our assumed opening
  // balance (the June import's own validated final balance) — same-day rows have no reliable
  // ordering column, so we can't just take "the last row by date" as the June closing balance.
  const existingTxs = await db
    .select({ transactionDate: schema.transactions.transactionDate, balanceAfter: schema.transactions.balanceAfter })
    .from(schema.transactions)
    .where(eq(schema.transactions.bankAccountId, bankAccountId));
  const maxDate = existingTxs.reduce<string | null>((max, t) => (max === null || t.transactionDate > max ? t.transactionDate : max), null);
  const hasOpeningBalanceRow = existingTxs.some(
    (t) => t.balanceAfter !== null && round2(Number(t.balanceAfter)) === round2(OPENING_BALANCE)
  );
  if (existingTxs.length > 0 && !hasOpeningBalanceRow) {
    throw new Error(
      `No existing transaction on this account carries balanceAfter=${OPENING_BALANCE} (latest existing date: ${maxDate}) — aborting to avoid a discontinuous ledger.`
    );
  }
  if (existingTxs.length > 0 && maxDate !== null && maxDate >= RAW_ENTRIES[0].date) {
    throw new Error(`Existing transactions already reach ${maxDate}, on/after this import's first date (${RAW_ENTRIES[0].date}) — likely already imported.`);
  }

  // --- Resolve category ids, creating the missing ones if needed -------------
  const existingCategories = await db.select().from(schema.categories);
  const categoryByKey = new Map(existingCategories.map((c) => [c.key, c]));
  const usedKeys = new Set(RAW_ENTRIES.map((e) => e.categoryKey));
  const missingKeys = [...usedKeys].filter((k) => !categoryByKey.has(k));
  const unexpectedMissing = missingKeys.filter((k) => !NEW_CATEGORIES.some((c) => c.key === k));
  if (unexpectedMissing.length > 0) {
    throw new Error(`Category key(s) used by RAW_ENTRIES have no seed and no NEW_CATEGORIES entry: ${unexpectedMissing.join(", ")}`);
  }

  let categoriesCreated = 0;
  let insertedCount = 0;
  let skippedDuplicateCount = 0;

  if (isDryRun) {
    categoriesCreated = missingKeys.length;
    const existingHashes = new Set(
      (
        await db
          .select({ dedupHash: schema.transactions.dedupHash })
          .from(schema.transactions)
          .where(eq(schema.transactions.bankAccountId, bankAccountId))
      ).map((r) => r.dedupHash)
    );
    for (const row of rows) {
      const dedupHash = computeDedupHash({
        bankAccountId,
        transactionDate: row.date,
        moneyIn: row.moneyIn,
        moneyOut: row.moneyOut,
        balanceAfter: row.balanceAfter,
        description: row.description,
      });
      if (existingHashes.has(dedupHash)) skippedDuplicateCount++;
      else insertedCount++;
    }
  } else {
    await db.transaction(async (tx) => {
      for (const spec of NEW_CATEGORIES) {
        if (categoryByKey.has(spec.key)) continue;
        const [created] = await tx
          .insert(schema.categories)
          .values({ key: spec.key, label: spec.label, kind: spec.kind })
          .onConflictDoNothing({ target: schema.categories.key })
          .returning();
        if (created) {
          categoryByKey.set(spec.key, created);
          categoriesCreated++;
        }
      }

      for (const row of rows) {
        const category = categoryByKey.get(row.categoryKey);
        if (!category) throw new Error(`Category "${row.categoryKey}" could not be resolved after creation step`);

        const dedupHash = computeDedupHash({
          bankAccountId,
          transactionDate: row.date,
          moneyIn: row.moneyIn,
          moneyOut: row.moneyOut,
          balanceAfter: row.balanceAfter,
          description: row.description,
        });

        const [inserted] = await tx
          .insert(schema.transactions)
          .values({
            bankAccountId,
            transactionDate: row.date,
            description: row.description,
            counterparty: row.counterparty,
            moneyIn: row.moneyIn?.toString() ?? null,
            moneyOut: row.moneyOut?.toString() ?? null,
            balanceAfter: row.balanceAfter.toString(),
            categoryId: category.id,
            isBusiness: row.isBusiness ?? false,
            isInvestment: row.isInvestment ?? false,
            isInternalTransfer: row.isInternalTransfer ?? false,
            reviewedAt: new Date(),
            dedupHash,
          })
          .onConflictDoNothing({ target: [schema.transactions.bankAccountId, schema.transactions.dedupHash] })
          .returning({ id: schema.transactions.id });

        if (inserted) insertedCount++;
        else skippedDuplicateCount++;
      }
    });

    await recomputeSnapshotForBankAccount(bankAccountId, finalBalance, SNAPSHOT_DATE);
  }

  console.log("");
  console.log(`Mode:                   ${isDryRun ? "DRY RUN (no writes)" : "LIVE"}`);
  console.log(`BCA bank account:       ${bankAccountId}`);
  console.log(`Entries to import:      ${rows.length}`);
  console.log(`Inserted:               ${insertedCount}`);
  console.log(`Skipped (duplicate):    ${skippedDuplicateCount}`);
  console.log(`Categories created:     ${categoriesCreated} (${NEW_CATEGORIES.map((c) => c.key).join(", ")})`);
  console.log(`Opening balance:        ${OPENING_BALANCE}`);
  console.log(`Computed final balance: ${finalBalance} (statement reports ${309_398_266} — matches to rounding)`);
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
