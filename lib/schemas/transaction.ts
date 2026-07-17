import { z } from "zod";

/** Fields a user can edit on a transaction, before or after it's committed. */
export const transactionEditSchema = z.object({
  categoryId: z.uuid().nullable(),
  subcategoryId: z.uuid().nullable(),
  isBusiness: z.boolean(),
  isInvestment: z.boolean(),
});
export type TransactionEdit = z.infer<typeof transactionEditSchema>;

export const manualTransferLinkSchema = z.object({
  fromTransactionId: z.uuid(),
  toTransactionId: z.uuid(),
});
export type ManualTransferLink = z.infer<typeof manualTransferLinkSchema>;
