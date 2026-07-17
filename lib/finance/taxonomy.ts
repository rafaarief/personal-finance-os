export type AssetCategory = "cash" | "investment" | "business" | "other";

/**
 * Suggested subcategories per asset category, per PRD section 7 Module 2.
 * Stored as free text on `assets.subcategory` (not a DB enum) so adding a new
 * exchange/business/holding never needs a migration — this list only drives
 * the <select> in the Asset form.
 */
export const ASSET_SUBCATEGORY_SUGGESTIONS: Record<AssetCategory, string[]> = {
  cash: ["BCA", "Jago", "BNI", "Mandiri", "Cash"],
  investment: ["Stockbit", "Reku", "Bitget", "Bybit", "Pintu", "Pluang"],
  business: ["BoothyCall", "Breadwinner", "PWN", "Analog"],
  other: ["Gold", "Property", "Vehicle", "Receivable"],
};

export const ASSET_CATEGORY_LABELS: Record<AssetCategory, string> = {
  cash: "Cash",
  investment: "Investment",
  business: "Business",
  other: "Other",
};

export type CategoryKind = "income" | "expense" | "transfer";

export interface CategorySeed {
  key: string;
  label: string;
  kind: CategoryKind;
  subcategories?: string[];
}

/**
 * Seed list for the `categories`/`subcategories` tables, derived from PRD
 * Module 5 (Expense & Income Dashboard). This is the closed vocabulary
 * Claude is constrained to when categorizing extracted transactions.
 */
export const CATEGORY_SEED: CategorySeed[] = [
  { key: "salary", label: "Salary", kind: "income" },
  { key: "business_income", label: "Business Income", kind: "income" },
  { key: "investment_income", label: "Investment Income / Dividends", kind: "income" },
  { key: "asset_sale", label: "Asset Sale", kind: "income" },
  { key: "other_income", label: "Other Income", kind: "income" },

  { key: "groceries", label: "Groceries", kind: "expense" },
  { key: "dining_coffee", label: "Dining & Coffee", kind: "expense" },
  { key: "transport_fuel", label: "Transport & Fuel", kind: "expense" },
  { key: "utilities_bills", label: "Utilities & Bills", kind: "expense" },
  { key: "rent_mortgage", label: "Rent / Mortgage", kind: "expense" },
  { key: "shopping", label: "Shopping", kind: "expense" },
  {
    key: "entertainment_subscriptions",
    label: "Entertainment & Subscriptions",
    kind: "expense",
  },
  { key: "health_medical", label: "Health & Medical", kind: "expense" },
  { key: "education", label: "Education", kind: "expense" },
  { key: "insurance", label: "Insurance", kind: "expense" },
  { key: "business_expense", label: "Business Expense", kind: "expense" },
  { key: "investment_purchase", label: "Investment Purchase", kind: "expense" },
  { key: "fees_charges", label: "Fees & Charges", kind: "expense" },
  { key: "cash_withdrawal", label: "Cash Withdrawal", kind: "expense" },
  { key: "other_expense", label: "Other Expense", kind: "expense" },
  { key: "uncategorized", label: "Uncategorized", kind: "expense" },

  { key: "internal_transfer", label: "Internal Transfer", kind: "transfer" },
];

/** Below this confidence, a category suggestion is pre-flagged for review rather than trusted. */
export const AI_CONFIDENCE_REVIEW_THRESHOLD = 0.6;

/** Category key used when Claude wasn't confident enough, or found no match. */
export const UNCATEGORIZED_KEY = "uncategorized";

/** Category key reserved for confirmed internal transfers. */
export const INTERNAL_TRANSFER_KEY = "internal_transfer";
