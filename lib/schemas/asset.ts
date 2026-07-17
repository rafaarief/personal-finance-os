import { z } from "zod";

export const assetCategorySchema = z.enum(["cash", "investment", "business", "other"]);
export type AssetCategory = z.infer<typeof assetCategorySchema>;

/** Payload for creating/editing an asset via the Asset Management server actions. */
export const assetInputSchema = z.object({
  category: assetCategorySchema,
  subcategory: z.string().min(1).max(100),
  name: z.string().min(1).max(200),
  currentValue: z.coerce.number().finite(),
  purchaseValue: z.coerce.number().finite().nullable().default(null),
  currency: z.string().min(1).max(10).default("IDR"),
  notes: z.string().max(2000).nullable().default(null),
});
export type AssetInput = z.infer<typeof assetInputSchema>;
