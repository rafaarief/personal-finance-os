/**
 * Fixed categorical slot order, validated with the dataviz skill's
 * scripts/validate_palette.js (see /PALETTE.md at repo root). Never cycle or
 * reassign these per-render — each identity below is pinned to one slot so
 * the same category always reads as the same color everywhere in the app.
 */
export const CATEGORICAL_SLOTS = {
  coral: "#d15c56",
  purple: "#9b6bce",
  peach: "#c9690c",
  rose: "#c35c9b",
  gold: "#af7c00",
  blue: "#4087de",
  teal: "#00a16f",
} as const;

export const OTHER_COLOR = "#8a8296"; // muted ink — overflow bucket, not a themed hue

/** Asset category identity -> color, used by the Wealth Dashboard allocation chart. */
export const ASSET_CATEGORY_COLOR: Record<string, string> = {
  cash: CATEGORICAL_SLOTS.coral,
  investment: CATEGORICAL_SLOTS.purple,
  business: CATEGORICAL_SLOTS.peach,
  other: CATEGORICAL_SLOTS.rose,
  receivable: CATEGORICAL_SLOTS.gold,
  vehicle: CATEGORICAL_SLOTS.blue,
};

/**
 * Expense category identity -> color. Only the top 7 categories by typical
 * weight get a real hue; anything else folds into OTHER_COLOR in the chart —
 * per the skill's categorical cap, not a re-cycled hue.
 */
export const EXPENSE_CATEGORY_COLOR: Record<string, string> = {
  groceries: CATEGORICAL_SLOTS.coral,
  dining_coffee: CATEGORICAL_SLOTS.purple,
  transport_fuel: CATEGORICAL_SLOTS.peach,
  shopping: CATEGORICAL_SLOTS.rose,
  entertainment_subscriptions: CATEGORICAL_SLOTS.gold,
  business_expense: CATEGORICAL_SLOTS.blue,
  utilities_bills: CATEGORICAL_SLOTS.teal,
};

export const INCOME_CATEGORY_COLOR: Record<string, string> = {
  salary: CATEGORICAL_SLOTS.coral,
  business_income: CATEGORICAL_SLOTS.purple,
  investment_income: CATEGORICAL_SLOTS.peach,
  asset_sale: CATEGORICAL_SLOTS.rose,
  other_income: CATEGORICAL_SLOTS.gold,
};

export function colorForKey(map: Record<string, string>, key: string): string {
  return map[key] ?? OTHER_COLOR;
}
