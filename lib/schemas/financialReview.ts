import { z } from "zod";

/**
 * Zod is the authority for the AI narrative response, same pattern as
 * lib/schemas/extraction.ts — the model's JSON is parsed defensively and
 * re-validated here before it ever reaches the database or the UI.
 */
export const financialReviewResponseSchema = z.object({
  summary: z.string().min(1).max(1200),
  recommendation: z.string().min(1).max(500).nullable().default(null),
});
export type FinancialReviewResponse = z.infer<typeof financialReviewResponseSchema>;
