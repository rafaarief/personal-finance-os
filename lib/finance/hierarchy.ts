import type { AssetCategory } from "./taxonomy";
import { CATEGORICAL_SLOTS } from "./chartColors";

/**
 * Balance-sheet hierarchy layered on top of the existing `assets.category`
 * enum (cash/investment/business/other/receivable/vehicle). Deliberately NOT
 * new DB columns: liquidity_class and asset_class are a lossless, deterministic
 * function of `category` alone, so storing them again would just be a second
 * copy that could drift out of sync. Recomputed here instead, per the "prefer
 * calculating derived values" guidance.
 */
export type LiquidityClass = "LIQUID" | "NON_LIQUID";
export type AssetClass = "CASH" | "CAPITAL_MARKET" | "BUSINESS" | "OTHER_ASSET";

export const CATEGORY_TO_ASSET_CLASS: Record<AssetCategory, AssetClass> = {
  cash: "CASH",
  investment: "CAPITAL_MARKET",
  business: "BUSINESS",
  other: "OTHER_ASSET",
  receivable: "OTHER_ASSET",
  vehicle: "OTHER_ASSET",
};

export const ASSET_CLASS_TO_LIQUIDITY: Record<AssetClass, LiquidityClass> = {
  CASH: "LIQUID",
  CAPITAL_MARKET: "LIQUID",
  BUSINESS: "NON_LIQUID",
  OTHER_ASSET: "NON_LIQUID",
};

export function assetClassOf(category: AssetCategory): AssetClass {
  return CATEGORY_TO_ASSET_CLASS[category];
}

export function liquidityClassOf(category: AssetCategory): LiquidityClass {
  return ASSET_CLASS_TO_LIQUIDITY[assetClassOf(category)];
}

export const ASSET_CLASS_LABELS: Record<AssetClass, string> = {
  CASH: "Cash",
  CAPITAL_MARKET: "Capital Market",
  BUSINESS: "Business",
  OTHER_ASSET: "Other Assets",
};

export const ASSET_CLASS_COLOR: Record<AssetClass, string> = {
  CASH: CATEGORICAL_SLOTS.coral,
  CAPITAL_MARKET: CATEGORICAL_SLOTS.purple,
  BUSINESS: CATEGORICAL_SLOTS.peach,
  OTHER_ASSET: CATEGORICAL_SLOTS.rose,
};

/** Other Assets' internal subtype — preserved for the Receivables/Vehicle secondary breakdown. */
export type OtherAssetSubtype = "RECEIVABLE" | "VEHICLE" | "OTHER";

export const CATEGORY_TO_OTHER_ASSET_SUBTYPE: Partial<Record<AssetCategory, OtherAssetSubtype>> = {
  receivable: "RECEIVABLE",
  vehicle: "VEHICLE",
  other: "OTHER",
};

export const OTHER_ASSET_SUBTYPE_LABELS: Record<OtherAssetSubtype, string> = {
  RECEIVABLE: "Receivables",
  VEHICLE: "Vehicle",
  OTHER: "Other",
};
