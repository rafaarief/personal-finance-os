import { extractText, getDocumentProxy } from "unpdf";

/**
 * Text extraction for BCA/Jago statement PDFs. If a bank's tabular layout comes
 * out jumbled (columns interleaved), the escape hatch is dropping to
 * `pdfjs-dist`'s `getTextContent()` directly and reconstructing rows by
 * sorting text items by y-then-x position before this function is called —
 * only worth the effort if the review UI shows poor extraction accuracy with
 * this simple dump, since Claude tends to parse messy statement text well on
 * its own given a bank-specific system prompt.
 */
export async function parsePdfStatement(fileBuffer: ArrayBuffer): Promise<string> {
  const pdf = await getDocumentProxy(new Uint8Array(fileBuffer));
  const { text } = await extractText(pdf, { mergePages: true });
  return text;
}
