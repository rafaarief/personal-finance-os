import { relations } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const assetCategoryEnum = pgEnum("asset_category", ["cash", "investment", "business", "other"]);
export const categoryKindEnum = pgEnum("category_kind", ["income", "expense", "transfer"]);
export const bankCodeEnum = pgEnum("bank_code", ["bca", "jago", "bni", "mandiri"]);
export const sourceFileTypeEnum = pgEnum("source_file_type", ["pdf", "csv"]);
export const importStatusEnum = pgEnum("import_status", [
  "uploaded",
  "parsing",
  "parsed",
  "reviewing",
  "committed",
  "failed",
]);
export const snapshotSourceEnum = pgEnum("snapshot_source", ["manual", "import"]);
export const transferMatchMethodEnum = pgEnum("transfer_match_method", ["amount_date_heuristic", "manual"]);

// --- Asset tracking (Module 1 & 2) ---------------------------------------

export const assets = pgTable("assets", {
  id: uuid("id").primaryKey().defaultRandom(),
  category: assetCategoryEnum("category").notNull(),
  subcategory: text("subcategory").notNull(),
  name: text("name").notNull(),
  currentValue: numeric("current_value", { precision: 16, scale: 2 }).notNull(),
  purchaseValue: numeric("purchase_value", { precision: 16, scale: 2 }),
  currency: text("currency").notNull().default("IDR"),
  notes: text("notes"),
  isActive: boolean("is_active").notNull().default(true),
  lastUpdatedAt: timestamp("last_updated_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const assetValueSnapshots = pgTable(
  "asset_value_snapshots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    assetId: uuid("asset_id")
      .notNull()
      .references(() => assets.id, { onDelete: "cascade" }),
    snapshotDate: date("snapshot_date").notNull(),
    currentValue: numeric("current_value", { precision: 16, scale: 2 }).notNull(),
    source: snapshotSourceEnum("source").notNull().default("manual"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("asset_value_snapshots_asset_date_idx").on(table.assetId, table.snapshotDate)]
);

// --- Bank accounts ----------------------------------------------------------

export const bankAccounts = pgTable("bank_accounts", {
  id: uuid("id").primaryKey().defaultRandom(),
  bankCode: bankCodeEnum("bank_code").notNull(),
  accountName: text("account_name").notNull(),
  accountNumberMasked: text("account_number_masked"),
  linkedAssetId: uuid("linked_asset_id").references(() => assets.id, { onDelete: "set null" }),
  currency: text("currency").notNull().default("IDR"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// --- Transaction taxonomy (Module 4/5) --------------------------------------

export const categories = pgTable("categories", {
  id: uuid("id").primaryKey().defaultRandom(),
  key: text("key").notNull().unique(),
  label: text("label").notNull(),
  kind: categoryKindEnum("kind").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const subcategories = pgTable(
  "subcategories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    label: text("label").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (table) => [uniqueIndex("subcategories_category_key_idx").on(table.categoryId, table.key)]
);

// --- Statement imports (Module 3) -------------------------------------------

export const statementImports = pgTable("statement_imports", {
  id: uuid("id").primaryKey().defaultRandom(),
  bankAccountId: uuid("bank_account_id")
    .notNull()
    .references(() => bankAccounts.id, { onDelete: "cascade" }),
  sourceFilename: text("source_filename").notNull(),
  sourceFileType: sourceFileTypeEnum("source_file_type").notNull(),
  status: importStatusEnum("status").notNull().default("uploaded"),
  rawExtractedJson: jsonb("raw_extracted_json"),
  statementPeriodStart: date("statement_period_start"),
  statementPeriodEnd: date("statement_period_end"),
  totalExtracted: integer("total_extracted").notNull().default(0),
  totalNew: integer("total_new").notNull().default(0),
  totalDuplicate: integer("total_duplicate").notNull().default(0),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  committedAt: timestamp("committed_at", { withTimezone: true }),
});

// --- Transactions (Module 4) ------------------------------------------------

export const transactions = pgTable(
  "transactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    bankAccountId: uuid("bank_account_id")
      .notNull()
      .references(() => bankAccounts.id, { onDelete: "cascade" }),
    statementImportId: uuid("statement_import_id").references(() => statementImports.id, {
      onDelete: "set null",
    }),
    transactionDate: date("transaction_date").notNull(),
    description: text("description").notNull(),
    counterparty: text("counterparty"),
    moneyIn: numeric("money_in", { precision: 14, scale: 2 }),
    moneyOut: numeric("money_out", { precision: 14, scale: 2 }),
    balanceAfter: numeric("balance_after", { precision: 14, scale: 2 }),
    categoryId: uuid("category_id").references(() => categories.id, { onDelete: "set null" }),
    subcategoryId: uuid("subcategory_id").references(() => subcategories.id, { onDelete: "set null" }),
    isBusiness: boolean("is_business").notNull().default(false),
    isInvestment: boolean("is_investment").notNull().default(false),
    isInternalTransfer: boolean("is_internal_transfer").notNull().default(false),
    aiConfidence: numeric("ai_confidence", { precision: 4, scale: 3 }),
    aiSuggestedCategoryId: uuid("ai_suggested_category_id").references(() => categories.id, {
      onDelete: "set null",
    }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    dedupHash: text("dedup_hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("transactions_bank_account_dedup_hash_idx").on(table.bankAccountId, table.dedupHash),
    index("transactions_transaction_date_idx").on(table.transactionDate),
    index("transactions_category_id_idx").on(table.categoryId),
  ]
);

// --- AI Financial Review (day-cached) ----------------------------------------

export const financialReviews = pgTable("financial_reviews", {
  id: uuid("id").primaryKey().defaultRandom(),
  reviewDate: date("review_date").notNull().unique(),
  netWorth: numeric("net_worth", { precision: 16, scale: 2 }).notNull(),
  highlights: jsonb("highlights").notNull(),
  summary: text("summary").notNull(),
  recommendation: text("recommendation"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const internalTransferLinks = pgTable(
  "internal_transfer_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    fromTransactionId: uuid("from_transaction_id")
      .notNull()
      .references(() => transactions.id, { onDelete: "cascade" }),
    toTransactionId: uuid("to_transaction_id")
      .notNull()
      .references(() => transactions.id, { onDelete: "cascade" }),
    matchConfidence: numeric("match_confidence", { precision: 4, scale: 3 }).notNull(),
    matchMethod: transferMatchMethodEnum("match_method").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("internal_transfer_links_pair_idx").on(table.fromTransactionId, table.toTransactionId)]
);

// --- Relations ---------------------------------------------------------------

export const assetsRelations = relations(assets, ({ many }) => ({
  snapshots: many(assetValueSnapshots),
  bankAccounts: many(bankAccounts),
}));

export const assetValueSnapshotsRelations = relations(assetValueSnapshots, ({ one }) => ({
  asset: one(assets, { fields: [assetValueSnapshots.assetId], references: [assets.id] }),
}));

export const bankAccountsRelations = relations(bankAccounts, ({ one, many }) => ({
  linkedAsset: one(assets, { fields: [bankAccounts.linkedAssetId], references: [assets.id] }),
  transactions: many(transactions),
  statementImports: many(statementImports),
}));

export const categoriesRelations = relations(categories, ({ many }) => ({
  subcategories: many(subcategories),
}));

export const subcategoriesRelations = relations(subcategories, ({ one }) => ({
  category: one(categories, { fields: [subcategories.categoryId], references: [categories.id] }),
}));

export const statementImportsRelations = relations(statementImports, ({ one, many }) => ({
  bankAccount: one(bankAccounts, { fields: [statementImports.bankAccountId], references: [bankAccounts.id] }),
  transactions: many(transactions),
}));

export const transactionsRelations = relations(transactions, ({ one }) => ({
  bankAccount: one(bankAccounts, { fields: [transactions.bankAccountId], references: [bankAccounts.id] }),
  statementImport: one(statementImports, {
    fields: [transactions.statementImportId],
    references: [statementImports.id],
  }),
  category: one(categories, { fields: [transactions.categoryId], references: [categories.id] }),
  subcategory: one(subcategories, { fields: [transactions.subcategoryId], references: [subcategories.id] }),
}));
