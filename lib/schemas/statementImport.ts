import { z } from "zod";

export const sourceFileTypeSchema = z.enum(["pdf", "csv"]);
export type SourceFileType = z.infer<typeof sourceFileTypeSchema>;

export const importStatusSchema = z.enum([
  "uploaded",
  "parsing",
  "parsed",
  "reviewing",
  "committed",
  "failed",
]);
export type ImportStatus = z.infer<typeof importStatusSchema>;
