export const BUSINESS_VALUATION_METHODS = [
  "Book Value",
  "Cost Basis",
  "Founder Estimate",
  "Revenue Multiple",
  "EBITDA Multiple",
  "External Valuation",
  "Other",
] as const;

export type BusinessValuationMethod = (typeof BUSINESS_VALUATION_METHODS)[number];
