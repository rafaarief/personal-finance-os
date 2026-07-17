import { parse } from "csv-parse/sync";

/**
 * CSV rows are routed through the same Claude extraction call as PDFs (rather
 * than a separate deterministic CSV parser) so categorization and
 * transfer-detection logic lives in exactly one place. This just turns the
 * CSV into a plain-text table Claude can read.
 */
export function parseCsvStatement(fileBuffer: ArrayBuffer): string {
  const text = new TextDecoder("utf-8").decode(fileBuffer);
  const rows: string[][] = parse(text, {
    skip_empty_lines: true,
    relax_column_count: true,
  });

  return rows.map((row) => row.join(" | ")).join("\n");
}
