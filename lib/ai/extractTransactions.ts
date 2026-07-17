import { getAnthropicClient, getAnthropicModel } from "./anthropicClient";
import { bcaSystemPrompt } from "./prompts/bca";
import { jagoSystemPrompt } from "./prompts/jago";
import { emitExtractedTransactionsToolSchema, extractedStatementSchema, type ExtractedStatement } from "../schemas/extraction";
import type { CategorySeed } from "../finance/taxonomy";

const BANK_PROMPTS: Record<string, string> = {
  bca: bcaSystemPrompt,
  jago: jagoSystemPrompt,
};

export class StatementExtractionError extends Error {}

interface ExtractTransactionsInput {
  bankCode: string;
  statementText: string;
  categories: CategorySeed[];
}

export async function extractTransactions({
  bankCode,
  statementText,
  categories,
}: ExtractTransactionsInput): Promise<ExtractedStatement> {
  const client = getAnthropicClient();
  if (!client) {
    throw new StatementExtractionError(
      "ANTHROPIC_API_KEY is not configured — statement extraction has no fallback path."
    );
  }

  const bankPrompt = BANK_PROMPTS[bankCode];
  if (!bankPrompt) {
    throw new StatementExtractionError(`No extraction prompt for bank code "${bankCode}"`);
  }

  const categoryList = categories
    .map((category) => `- ${category.key} (${category.kind}): ${category.label}`)
    .join("\n");

  const systemPrompt = `${bankPrompt}

For suggestedCategoryKey, choose exactly one of the following keys (use "uncategorized" if none fit well):
${categoryList}

Set confidence between 0 and 1 based on how certain you are about the category choice.`;

  const toolName = emitExtractedTransactionsToolSchema.name;

  let response;
  try {
    response = await client.messages.create({
      model: getAnthropicModel(),
      max_tokens: 8192,
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: `Here is the raw statement text:\n\n${statementText}`,
        },
      ],
      tools: [emitExtractedTransactionsToolSchema],
      tool_choice: { type: "tool", name: toolName },
    });
  } catch (error) {
    throw new StatementExtractionError(
      `Claude request failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  const toolUse = response.content.find(
    (block): block is Extract<typeof block, { type: "tool_use" }> => block.type === "tool_use"
  );

  if (!toolUse) {
    throw new StatementExtractionError("Claude did not return the expected tool call");
  }

  const parsed = extractedStatementSchema.safeParse(toolUse.input);
  if (!parsed.success) {
    throw new StatementExtractionError(`Claude's output failed validation: ${parsed.error.message}`);
  }

  return parsed.data;
}
