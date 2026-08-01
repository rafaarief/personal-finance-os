/**
 * One-time importer: Bank Jago transactions for July 2026, sourced directly
 * from the user's reconciled CSV export (Downloads/bank_jago_july_2026_transactions.csv)
 * rather than a hand-transcribed table — earlier attempts at transcribing
 * this statement by hand didn't reconcile (missing large "pocket transfer"
 * rows entirely, then still off by ~9,000 after a manual correction pass).
 * This CSV carries explicit per-row flags that remove the guesswork:
 *
 *   direction                     IN / OUT
 *   exclude_from_income_expense   true  -> this row is a wash/internal move,
 *                                          not real income or spending
 *   business_personal             BUSINESS / PERSONAL
 *
 * Notably this resolves something the hand-typed version got wrong: EVERY
 * "Deposit from GoPay" row (category "Internal Transfer", subcategory
 * "GoPay to Bank Jago") is flagged exclude_from_income_expense=true — GoPay
 * is itself a tracked cash asset in this app, so sweeping it into Jago is a
 * transfer between two tracked accounts, not new business revenue. Likewise
 * every "BoothyCall Pocket" transfer (the big 24/25/30 Jul lines) is a
 * same-owner pocket-to-pocket move, not business income/cost, contrary to
 * this script's first draft. isInternalTransfer below = exactly that CSV
 * column, not a re-guess.
 *
 * category -> app taxonomy key mapping is a fixed lookup (CATEGORY_MAP);
 * isBusiness = business_personal === "BUSINESS"; isInvestment = category ===
 * "Interest Income". Money in/out and the running balance come straight from
 * the CSV's own amount_idr + direction, summed and validated against
 * EXPECTED_TOTAL_IN/OUT/BALANCE (independently computed from this same file
 * — see scripts/tmp-inspect/parse-jago-csv.ts).
 *
 * Usage:
 *   pnpm import:jago-jul-2026 -- --dry-run
 *   pnpm import:jago-jul-2026
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { readFileSync } from "fs";
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "../lib/db/client";
import { computeDedupHash } from "../lib/statementImport/dedup";
import { recomputeSnapshotForBankAccount } from "../lib/finance/recomputeSnapshots";

const JAGO_ASSET_NAME = "Bank Jago";
const CSV_PATH = "/Users/rafaarief/Downloads/bank_jago_july_2026_transactions.csv";

const NEW_CATEGORIES: { key: string; label: string; kind: "income" | "expense" | "transfer" }[] = [
  { key: "personal_transfer_income", label: "Personal Transfer", kind: "income" },
  { key: "personal_transfer_expense", label: "Personal Transfer", kind: "expense" },
  { key: "donation", label: "Donation", kind: "expense" },
  { key: "lifestyle", label: "Lifestyle", kind: "expense" },
  { key: "personal_care", label: "Personal Care", kind: "expense" },
];

/** BCA July rows imported under other_income that are really personal transfers — see import-bca-jul-2026.ts header. */
const BCA_PERSONAL_TRANSFER_RECLASSIFY: { date: string; counterparty: string; moneyIn: number }[] = [
  { date: "2026-07-01", counterparty: "Muhammad Rizky", moneyIn: 265_500 },
  { date: "2026-07-01", counterparty: "Darin", moneyIn: 600_000 },
  { date: "2026-07-03", counterparty: "Darin", moneyIn: 1_200_000 },
  { date: "2026-07-09", counterparty: "Rakha", moneyIn: 253_000 },
  { date: "2026-07-25", counterparty: "Nita Nidiya", moneyIn: 75_000 },
  { date: "2026-07-30", counterparty: "Rakha", moneyIn: 155_000 },
];

const CATEGORY_MAP: Record<string, { key: string; incomeKeyIfIn?: string }> = {
  "Internal Transfer": { key: "internal_transfer" },
  Lifestyle: { key: "lifestyle" },
  "Food & Beverage": { key: "dining_coffee" },
  Donation: { key: "donation" },
  "Personal Care": { key: "personal_care" },
  Sports: { key: "other_expense" },
  Shopping: { key: "shopping" },
  "Other Expense": { key: "other_expense" },
  Subscription: { key: "entertainment_subscriptions" },
  Entertainment: { key: "entertainment_subscriptions" },
  "Interest Income": { key: "investment_income" },
  "Tax & Fees": { key: "tax" },
  Services: { key: "other_expense" },
  "Business Expense": { key: "business_expense" },
  "Transfer In": { key: "other_income" },
  "Personal Transfer": { key: "personal_transfer_expense", incomeKeyIfIn: "personal_transfer_income" },
};

interface RawEntry {
  date: string;
  description: string;
  categoryKey: string;
  moneyIn: number | null;
  moneyOut: number | null;
  isBusiness: boolean;
  isInvestment: boolean;
  isInternalTransfer: boolean;
}

function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') inQuotes = false;
      else cur += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ",") {
        fields.push(cur);
        cur = "";
      } else cur += c;
    }
  }
  fields.push(cur);
  return fields;
}

function loadEntriesFromCsv(path: string): RawEntry[] {
  const raw = readFileSync(path, "utf8");
  const lines = raw.replace(/^﻿/, "").trim().split("\n");
  const entries: RawEntry[] = [];
  for (let i = 1; i < lines.length; i++) {
    const f = parseCsvLine(lines[i]);
    const [transactionAt, , description, direction, amountIdr, category, , , businessPersonal, excludeFromIncomeExpense] = f;
    const amount = Number(amountIdr);
    const map = CATEGORY_MAP[category];
    if (!map) throw new Error(`Unmapped CSV category "${category}" on row ${i + 1} ("${description}") — add it to CATEGORY_MAP.`);
    const categoryKey = direction === "IN" && map.incomeKeyIfIn ? map.incomeKeyIfIn : map.key;
    entries.push({
      date: transactionAt.slice(0, 10),
      description: description.trim(),
      categoryKey,
      moneyIn: direction === "IN" ? amount : null,
      moneyOut: direction === "OUT" ? amount : null,
      isBusiness: businessPersonal.trim() === "BUSINESS",
      isInvestment: category === "Interest Income",
      isInternalTransfer: excludeFromIncomeExpense.trim() === "true",
    });
  }
  return entries;
}

const OPENING_BALANCE = 30_088_723;
const EXPECTED_TOTAL_IN = 77_363_099.25;
const EXPECTED_TOTAL_OUT = 59_696_489.85;
const EXPECTED_FINAL_BALANCE = round2(OPENING_BALANCE + (EXPECTED_TOTAL_IN - EXPECTED_TOTAL_OUT)); // 47,755,332.40
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

async function reclassifyBcaPersonalTransfers(
  tx: Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0],
  personalTransferIncomeCategoryId: string,
  isDryRun: boolean
): Promise<number> {
  const [bcaBankAccount] = await tx.select().from(schema.bankAccounts).where(eq(schema.bankAccounts.bankCode, "bca")).orderBy(schema.bankAccounts.createdAt).limit(1);
  if (!bcaBankAccount) return 0;

  const candidates = await tx
    .select({ id: schema.transactions.id, transactionDate: schema.transactions.transactionDate, counterparty: schema.transactions.counterparty, moneyIn: schema.transactions.moneyIn })
    .from(schema.transactions)
    .where(eq(schema.transactions.bankAccountId, bcaBankAccount.id));

  let updated = 0;
  for (const target of BCA_PERSONAL_TRANSFER_RECLASSIFY) {
    const match = candidates.find(
      (c) => c.transactionDate === target.date && c.counterparty === target.counterparty && Number(c.moneyIn) === target.moneyIn
    );
    if (!match) {
      console.log(`  WARNING: could not find BCA transaction to reclassify: ${target.date} ${target.counterparty} ${target.moneyIn}`);
      continue;
    }
    if (!isDryRun) {
      await tx.update(schema.transactions).set({ categoryId: personalTransferIncomeCategoryId }).where(eq(schema.transactions.id, match.id));
    }
    updated++;
  }
  return updated;
}

async function main() {
  const isDryRun = process.argv.includes("--dry-run");

  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set (checked .env.local). Refusing to continue.");
  }

  const RAW_ENTRIES = loadEntriesFromCsv(CSV_PATH);

  const totalIn = round2(RAW_ENTRIES.reduce((sum, e) => sum + (e.moneyIn ?? 0), 0));
  const totalOut = round2(RAW_ENTRIES.reduce((sum, e) => sum + (e.moneyOut ?? 0), 0));
  if (totalIn !== EXPECTED_TOTAL_IN) throw new Error(`Total money in ${totalIn} does not match expected ${EXPECTED_TOTAL_IN} — aborting.`);
  if (totalOut !== EXPECTED_TOTAL_OUT) throw new Error(`Total money out ${totalOut} does not match expected ${EXPECTED_TOTAL_OUT} — aborting.`);

  const rows = prepareRows(RAW_ENTRIES, OPENING_BALANCE);
  const finalBalance = rows[rows.length - 1].balanceAfter;
  if (finalBalance !== EXPECTED_FINAL_BALANCE) {
    throw new Error(`Computed final balance ${finalBalance} does not match expected ${EXPECTED_FINAL_BALANCE} — aborting.`);
  }

  const db = getDb();

  const [asset] = await db.select().from(schema.assets).where(and(eq(schema.assets.category, "cash"), eq(schema.assets.name, JAGO_ASSET_NAME))).limit(1);
  if (!asset) throw new Error(`No cash asset named "${JAGO_ASSET_NAME}" found — refusing to create one implicitly.`);

  const existingJagoBankAccounts = await db.select().from(schema.bankAccounts).where(eq(schema.bankAccounts.bankCode, "jago"));
  let bankAccountId = existingJagoBankAccounts[0]?.id ?? null;
  let bankAccountCreated = false;
  const warnings: string[] = [];
  if (existingJagoBankAccounts.length > 1) {
    warnings.push(`Found ${existingJagoBankAccounts.length} bank_accounts with bank_code='jago' — using the first (id=${bankAccountId}).`);
  }

  const existingTxs = bankAccountId
    ? await db.select({ transactionDate: schema.transactions.transactionDate }).from(schema.transactions).where(eq(schema.transactions.bankAccountId, bankAccountId))
    : [];
  if (existingTxs.length > 0) {
    throw new Error(`Jago bank account ${bankAccountId} already has ${existingTxs.length} transactions — this script assumes a first-time import. Aborting.`);
  }

  const categories = await db.select().from(schema.categories);
  const categoryByKey = new Map(categories.map((c) => [c.key, c]));
  const usedKeys = new Set(RAW_ENTRIES.map((e) => e.categoryKey));
  const missingKeys = [...usedKeys].filter((k) => !categoryByKey.has(k));
  const unexpectedMissing = missingKeys.filter((k) => !NEW_CATEGORIES.some((c) => c.key === k));
  if (unexpectedMissing.length > 0) {
    throw new Error(`Category key(s) used by RAW_ENTRIES have no seed and no NEW_CATEGORIES entry: ${unexpectedMissing.join(", ")}`);
  }

  let categoriesCreated = 0;
  let insertedCount = 0;
  let skippedDuplicateCount = 0;
  let reclassifiedCount = 0;

  if (isDryRun) {
    categoriesCreated = missingKeys.length;
    insertedCount = rows.length;
    reclassifiedCount = BCA_PERSONAL_TRANSFER_RECLASSIFY.length;
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

      if (!bankAccountId) {
        const [created] = await tx
          .insert(schema.bankAccounts)
          .values({ bankCode: "jago", accountName: JAGO_ASSET_NAME, linkedAssetId: asset.id })
          .returning({ id: schema.bankAccounts.id });
        bankAccountId = created.id;
        bankAccountCreated = true;
      } else {
        const row = existingJagoBankAccounts[0];
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
            moneyIn: row.moneyIn?.toString() ?? null,
            moneyOut: row.moneyOut?.toString() ?? null,
            balanceAfter: row.balanceAfter.toString(),
            categoryId: category.id,
            isBusiness: row.isBusiness,
            isInvestment: row.isInvestment,
            isInternalTransfer: row.isInternalTransfer,
            reviewedAt: new Date(),
            dedupHash,
          })
          .onConflictDoNothing({ target: [schema.transactions.bankAccountId, schema.transactions.dedupHash] })
          .returning({ id: schema.transactions.id });

        if (inserted) insertedCount++;
        else skippedDuplicateCount++;
      }

      const personalTransferIncomeCategory = categoryByKey.get("personal_transfer_income")!;
      reclassifiedCount = await reclassifyBcaPersonalTransfers(tx, personalTransferIncomeCategory.id, false);
    });

    await recomputeSnapshotForBankAccount(bankAccountId!, finalBalance, SNAPSHOT_DATE);
  }

  console.log("");
  console.log(`Mode:                        ${isDryRun ? "DRY RUN (no writes)" : "LIVE"}`);
  console.log(`Source CSV:                  ${CSV_PATH}`);
  console.log(`Jago bank account:           ${bankAccountId ?? "(would be created)"}${bankAccountCreated ? " (created)" : ""}`);
  console.log(`Entries to import:           ${rows.length}`);
  console.log(`Inserted:                    ${insertedCount}`);
  console.log(`Skipped (duplicate):         ${skippedDuplicateCount}`);
  console.log(`Categories created:          ${categoriesCreated} (${NEW_CATEGORIES.map((c) => c.key).join(", ")})`);
  console.log(`BCA rows reclassified:       ${reclassifiedCount} / ${BCA_PERSONAL_TRANSFER_RECLASSIFY.length} (other_income -> personal_transfer_income)`);
  console.log(`Opening balance:             ${OPENING_BALANCE}`);
  console.log(`Computed money in / out:     ${totalIn} / ${totalOut}`);
  console.log(`Computed final balance:      ${finalBalance}`);
  console.log(`Wealth snapshot pushed:      ${isDryRun ? "no (dry run)" : `yes, asOf ${SNAPSHOT_DATE.toISOString().slice(0, 10)}`}`);
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
