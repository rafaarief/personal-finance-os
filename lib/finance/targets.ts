/**
 * Hardcoded allocation targets used by the AI Financial Review's deterministic
 * highlight checks. Not yet user-editable — a settings UI is a fast-follow,
 * not a blocker for the review feature itself.
 */
export const ALLOCATION_TARGETS = {
  /** Cash should stay at or above this share of net worth for liquidity comfort. */
  cashMin: 0.2,
  /** Rough target share of net worth in investments. */
  investmentTarget: 0.35,
  /** Business exposure above this share of net worth is flagged. */
  businessMax: 0.4,
};

/** Months of average expenses a comfortable emergency fund should cover. */
export const EMERGENCY_FUND_TARGET_MONTHS = 6;
