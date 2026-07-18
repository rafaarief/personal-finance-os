/**
 * One-time importer: historical net-worth snapshots from "Accounting Rafa.xlsx"
 * (sheet "Calculation") into the existing assets / asset_value_snapshots tables.
 *
 * Usage:
 *   pnpm import:accounting -- --dry-run   # parse + validate only, no DB writes
 *   pnpm import:accounting                # actually write
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import XLSX from "xlsx";
import * as fs from "node:fs";
import * as path from "node:path";
import { eq } from "drizzle-orm";
import { getDb, schema } from "../lib/db/client";

const SHEET_NAME = "Calculation";
const HEADER_ROW_INDEX = 1; // 0-based -> Excel row 2 (account names)
const GROUP_ROW_INDEX = 0; // 0-based -> Excel row 1 (LIQUID / NON LIQUID)
const FIRST_DATA_ROW_INDEX = 2; // 0-based -> Excel row 3
const DATE_COLUMN_INDEX = 0; // column A

type AssetCategory = "cash" | "investment" | "business" | "other";

interface AccountMapping {
  displayName: string;
  category: AssetCategory;
  subcategory: string;
  note?: string;
}

/**
 * Header text (trimmed, lowercased) -> where it lands in our schema.
 * Edit here if a mapping looks wrong — nothing else needs to change.
 */
const ACCOUNT_MAPPING: Record<string, AccountMapping> = {
  bca: { displayName: "BCA", category: "cash", subcategory: "BCA" },
  bni: { displayName: "BNI", category: "cash", subcategory: "BNI" },
  "bank jago": { displayName: "Bank Jago", category: "cash", subcategory: "Jago" },
  mandiri: { displayName: "Mandiri", category: "cash", subcategory: "Mandiri" },
  gopay: { displayName: "GoPay", category: "cash", subcategory: "GoPay" },
  ovo: { displayName: "OVO", category: "cash", subcategory: "OVO" },
  shopeepay: { displayName: "ShopeePay", category: "cash", subcategory: "ShopeePay" },
  narin: {
    displayName: "Narin",
    category: "cash",
    subcategory: "Narin",
    note: 'Ambiguous: grouped with e-wallets in the sheet but the name alone doesn\'t confirm what this account is. Review category/subcategory after import.',
  },
  bitget: { displayName: "Bitget", category: "investment", subcategory: "Bitget" },
  stockbit: { displayName: "Stockbit", category: "investment", subcategory: "Stockbit" },
  pintu: { displayName: "Pintu", category: "investment", subcategory: "Pintu" },
  "bybit ateng": { displayName: "Bybit Ateng", category: "investment", subcategory: "Bybit" },
  "reku spot": { displayName: "Reku Spot", category: "investment", subcategory: "Reku" },
  "reku us": { displayName: "Reku US", category: "investment", subcategory: "Reku" },
  pluang: { displayName: "Pluang", category: "investment", subcategory: "Pluang" },
  "cash on hand": { displayName: "Cash on Hand", category: "cash", subcategory: "Cash" },
  pwn: { displayName: "PWN", category: "business", subcategory: "PWN" },
  a: {
    displayName: "A",
    category: "other",
    subcategory: "A",
    note: 'Column header is literally "A" in the source sheet — unclear what this represents. Rename/recategorize after import.',
  },
  arisan: {
    displayName: "Arisan",
    category: "other",
    subcategory: "Receivable",
    note: "Treated as an informal rotating-savings pool (\"other\"), not a bank account or business.",
  },
  baswara: { displayName: "Baswara", category: "business", subcategory: "Baswara" },
  boothycall: { displayName: "BoothyCall", category: "business", subcategory: "BoothyCall" },
  breadwinner: { displayName: "BreadWinner", category: "business", subcategory: "Breadwinner" },
  sundrip: { displayName: "Sundrip", category: "business", subcategory: "Sundrip" },
  tens: { displayName: "TENS", category: "business", subcategory: "TENS" },
  "boothycall analog": { displayName: "BoothyCall Analog", category: "business", subcategory: "Analog" },
};

/** Computed/total columns in the sheet — not real accounts, always skipped. */
const EXCLUDED_HEADERS = new Set(["aset liquid", "aset non liquid", "total aset", "gain"]);

/** The one specific invalid date this sheet is known to contain. Anything else invalid is skipped + warned. */
const KNOWN_INVALID_DATE_TEXT = "31/09/2023";
const KNOWN_INVALID_DATE_FIX = "2023-09-30";

interface Warning {
  message: string;
}

interface ParsedSnapshotRow {
  excelRow: number;
  isoDate: string;
  values: Map<number, number>; // columnIndex -> parsed rupiah value
}

function normalizeHeaderKey(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

const DAYS_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]; // Feb generous (leap check separate)

function isValidCalendarDate(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12) return false;
  if (day < 1) return false;
  const isLeap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  const maxDay = month === 2 ? (isLeap ? 29 : 28) : DAYS_IN_MONTH[month - 1];
  return day <= maxDay;
}

function parseRupiah(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null;
  const trimmed = String(raw).trim();
  if (trimmed === "") return null;
  const isNegative = trimmed.startsWith("-");
  const digitsOnly = trimmed.replace(/[^0-9]/g, "");
  if (digitsOnly === "") return null;
  const value = parseInt(digitsOnly, 10);
  return isNegative ? -value : value;
}

function parseDateCell(
  cell: XLSX.CellObject | undefined,
  excelRow: number,
  warnings: Warning[]
): string | null {
  if (!cell || cell.v === undefined || cell.v === null || cell.v === "") {
    return null;
  }

  if (cell.t === "n") {
    // Numeric Excel date serial -> use SSF's date components directly (no timezone conversion).
    const parsed = XLSX.SSF.parse_date_code(cell.v as number);
    if (!parsed || !parsed.y) {
      warnings.push({ message: `Row ${excelRow}: could not decode numeric date serial "${cell.v}" — skipped.` });
      return null;
    }
    if (!isValidCalendarDate(parsed.y, parsed.m, parsed.d)) {
      warnings.push({ message: `Row ${excelRow}: decoded date ${parsed.y}-${parsed.m}-${parsed.d} is not a valid calendar date — skipped.` });
      return null;
    }
    return `${parsed.y}-${pad(parsed.m)}-${pad(parsed.d)}`;
  }

  if (cell.t === "s") {
    const raw = String(cell.v).trim();

    if (raw === KNOWN_INVALID_DATE_TEXT) {
      warnings.push({
        message: `Row ${excelRow}: normalized invalid date "${KNOWN_INVALID_DATE_TEXT}" to ${KNOWN_INVALID_DATE_FIX} (September has 30 days).`,
      });
      return KNOWN_INVALID_DATE_FIX;
    }

    let match = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/); // DD/MM/YYYY
    if (match) {
      const day = parseInt(match[1], 10);
      const month = parseInt(match[2], 10);
      const year = parseInt(match[3], 10);
      if (isValidCalendarDate(year, month, day)) {
        return `${year}-${pad(month)}-${pad(day)}`;
      }
      warnings.push({ message: `Row ${excelRow}: invalid date "${raw}" — skipped.` });
      return null;
    }

    match = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/); // YYYY-MM-DD
    if (match) {
      const year = parseInt(match[1], 10);
      const month = parseInt(match[2], 10);
      const day = parseInt(match[3], 10);
      if (isValidCalendarDate(year, month, day)) {
        return `${year}-${pad(month)}-${pad(day)}`;
      }
      warnings.push({ message: `Row ${excelRow}: invalid date "${raw}" — skipped.` });
      return null;
    }

    warnings.push({ message: `Row ${excelRow}: unrecognized date format "${raw}" — skipped.` });
    return null;
  }

  warnings.push({ message: `Row ${excelRow}: unexpected cell type for date column — skipped.` });
  return null;
}

function findWorkbookPath(): string {
  const candidates = [
    path.join(process.cwd(), "Accounting Rafa.xlsx"),
    path.join(process.cwd(), "data", "Accounting Rafa.xlsx"),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  throw new Error(
    `Could not find "Accounting Rafa.xlsx" in either:\n  ${candidates.join("\n  ")}\nPlace the workbook in one of those locations and re-run.`
  );
}

async function main() {
  const isDryRun = process.argv.includes("--dry-run");

  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set (checked .env.local). Refusing to continue.");
  }

  const workbookPath = findWorkbookPath();
  const workbook = XLSX.readFile(workbookPath, { cellDates: false });

  if (!workbook.SheetNames.includes(SHEET_NAME)) {
    throw new Error(`Sheet "${SHEET_NAME}" not found. Sheets present: ${workbook.SheetNames.join(", ")}`);
  }

  const sheet = workbook.Sheets[SHEET_NAME];
  const range = XLSX.utils.decode_range(sheet["!ref"] ?? "A1:A1");

  const warnings: Warning[] = [];

  // --- Build column -> account mapping from the header row -----------------
  interface ColumnInfo {
    colIndex: number;
    headerKey: string;
    mapping: AccountMapping;
  }
  const columns: ColumnInfo[] = [];
  const unmappedHeaders: string[] = [];

  for (let col = 1; col <= range.e.c; col++) {
    const headerCell = sheet[XLSX.utils.encode_cell({ r: HEADER_ROW_INDEX, c: col })];
    const headerKey = normalizeHeaderKey(headerCell?.v);
    if (!headerKey) continue; // gap/separator column
    if (EXCLUDED_HEADERS.has(headerKey)) continue; // computed total column

    const mapping = ACCOUNT_MAPPING[headerKey];
    if (!mapping) {
      unmappedHeaders.push(String(headerCell?.v));
      continue;
    }
    columns.push({ colIndex: col, headerKey, mapping });
  }

  if (unmappedHeaders.length > 0) {
    warnings.push({
      message: `Found column header(s) with no mapping entry (skipped, not imported): ${unmappedHeaders.join(", ")}. Add them to ACCOUNT_MAPPING in this script if they should be imported.`,
    });
  }

  // --- Walk data rows --------------------------------------------------------
  const parsedRows: ParsedSnapshotRow[] = [];
  let skippedInvalidRows = 0;
  let skippedBlankCells = 0;
  let totalRowsScanned = 0;

  for (let row = FIRST_DATA_ROW_INDEX; row <= range.e.r; row++) {
    const dateCell = sheet[XLSX.utils.encode_cell({ r: row, c: DATE_COLUMN_INDEX })];
    if (!dateCell || dateCell.v === undefined || dateCell.v === null || String(dateCell.v).trim() === "") {
      continue; // no date -> not a data row (covers all the trailing empty rows)
    }

    totalRowsScanned++;
    const excelRow = row + 1;
    const isoDate = parseDateCell(dateCell, excelRow, warnings);
    if (!isoDate) {
      skippedInvalidRows++;
      continue;
    }

    const values = new Map<number, number>();
    for (const column of columns) {
      const cell = sheet[XLSX.utils.encode_cell({ r: row, c: column.colIndex })];
      if (!cell || cell.v === undefined || cell.v === null || String(cell.v).trim() === "") {
        skippedBlankCells++;
        continue; // blank cell -> no snapshot for this account on this date, NOT zero
      }
      const numericValue = parseRupiah(cell.v);
      if (numericValue === null) {
        skippedBlankCells++;
        continue;
      }
      values.set(column.colIndex, numericValue);
    }

    parsedRows.push({ excelRow, isoDate, values });
  }

  // Chronological sanity check (informational only — never alters or rejects data).
  let previousDate: string | null = null;
  let previousExcelRow: number | null = null;
  for (const row of parsedRows) {
    if (previousDate && row.isoDate < previousDate) {
      warnings.push({
        message: `Row ${row.excelRow}: date ${row.isoDate} is earlier than row ${previousExcelRow}'s date ${previousDate} — sheet may have a data-entry typo (not altered, imported as-is).`,
      });
    }
    previousDate = row.isoDate;
    previousExcelRow = row.excelRow;
  }

  for (const mapping of columns.map((c) => c.mapping)) {
    if (mapping.note) {
      warnings.push({ message: `"${mapping.displayName}": ${mapping.note}` });
    }
  }

  // --- Compute latest known value per account (for the asset's currentValue on creation) ---
  const latestValueByColumn = new Map<number, { isoDate: string; value: number }>();
  for (const row of parsedRows) {
    for (const [colIndex, value] of row.values) {
      const existing = latestValueByColumn.get(colIndex);
      if (!existing || row.isoDate >= existing.isoDate) {
        latestValueByColumn.set(colIndex, { isoDate: row.isoDate, value });
      }
    }
  }

  // --- Match against existing assets -----------------------------------------
  const db = getDb();
  const existingAssets = await db.select().from(schema.assets);
  const existingAssetByKey = new Map(existingAssets.map((asset) => [`${asset.category}::${asset.name.toLowerCase()}`, asset]));

  const existingSnapshots = await db
    .select({ assetId: schema.assetValueSnapshots.assetId, snapshotDate: schema.assetValueSnapshots.snapshotDate })
    .from(schema.assetValueSnapshots);
  const existingSnapshotKeys = new Set(existingSnapshots.map((s) => `${s.assetId}::${s.snapshotDate}`));

  let accountsCreated = 0;
  let snapshotsInserted = 0;
  let snapshotsUpdated = 0;

  const columnToAssetId = new Map<number, string>();

  if (isDryRun) {
    for (const column of columns) {
      const key = `${column.mapping.category}::${column.mapping.displayName.toLowerCase()}`;
      if (!existingAssetByKey.has(key)) accountsCreated++;
    }
    for (const row of parsedRows) {
      for (const [colIndex] of row.values) {
        const column = columns.find((c) => c.colIndex === colIndex)!;
        const key = `${column.mapping.category}::${column.mapping.displayName.toLowerCase()}`;
        const existingAsset = existingAssetByKey.get(key);
        const alreadyExists = existingAsset && existingSnapshotKeys.has(`${existingAsset.id}::${row.isoDate}`);
        if (alreadyExists) snapshotsUpdated++;
        else snapshotsInserted++;
      }
    }
  } else {
    await db.transaction(async (tx) => {
      for (const column of columns) {
        const key = `${column.mapping.category}::${column.mapping.displayName.toLowerCase()}`;
        const existing = existingAssetByKey.get(key);
        if (existing) {
          columnToAssetId.set(column.colIndex, existing.id);
          continue;
        }

        const latest = latestValueByColumn.get(column.colIndex);
        const [created] = await tx
          .insert(schema.assets)
          .values({
            category: column.mapping.category,
            subcategory: column.mapping.subcategory,
            name: column.mapping.displayName,
            currentValue: (latest?.value ?? 0).toString(),
            currency: "IDR",
            notes: "Imported from Accounting Rafa.xlsx (Calculation sheet).",
            lastUpdatedAt: latest ? new Date(`${latest.isoDate}T00:00:00Z`) : new Date(),
          })
          .returning({ id: schema.assets.id });

        columnToAssetId.set(column.colIndex, created.id);
        existingAssetByKey.set(key, { id: created.id } as (typeof existingAssets)[number]);
        accountsCreated++;
      }

      for (const row of parsedRows) {
        for (const [colIndex, value] of row.values) {
          const assetId = columnToAssetId.get(colIndex)!;
          const wasExisting = existingSnapshotKeys.has(`${assetId}::${row.isoDate}`);

          await tx
            .insert(schema.assetValueSnapshots)
            .values({
              assetId,
              snapshotDate: row.isoDate,
              currentValue: value.toString(),
              source: "import",
            })
            .onConflictDoUpdate({
              target: [schema.assetValueSnapshots.assetId, schema.assetValueSnapshots.snapshotDate],
              set: { currentValue: value.toString(), source: "import" },
            });

          if (wasExisting) snapshotsUpdated++;
          else snapshotsInserted++;
        }
      }
    });
  }

  // --- Report ------------------------------------------------------------------
  console.log("");
  console.log(`Workbook:         ${workbookPath}`);
  console.log(`Worksheet:        ${SHEET_NAME}`);
  console.log(`Mode:             ${isDryRun ? "DRY RUN (no writes)" : "LIVE"}`);
  console.log(`Rows parsed:      ${totalRowsScanned}`);
  console.log(`Accounts found:   ${columns.length}`);
  console.log(`Accounts created: ${accountsCreated}`);
  console.log(`Snapshots inserted: ${snapshotsInserted}`);
  console.log(`Snapshots updated:  ${snapshotsUpdated}`);
  console.log(`Skipped blank cells: ${skippedBlankCells}`);
  console.log(`Skipped invalid rows: ${skippedInvalidRows}`);
  console.log("");
  if (warnings.length > 0) {
    console.log(`Warnings (${warnings.length}):`);
    for (const warning of warnings) console.log(`  - ${warning.message}`);
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
