/**
 * DeepSeek client — OpenAI-compatible chat completions API.
 * Base URL / auth format per https://api-docs.deepseek.com.
 * Mirrors the lazy-singleton, null-if-unset shape of anthropicClient.ts.
 */
const DEEPSEEK_BASE_URL = "https://api.deepseek.com/v1";

export function getDeepseekApiKey(): string | null {
  return process.env.DEEPSEEK_API_KEY || null;
}

export function getDeepseekModel(): string {
  return process.env.DEEPSEEK_MODEL || "deepseek-chat";
}

export interface DeepseekChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export class DeepseekRequestError extends Error {}

/** Plain chat completion — callers are responsible for parsing/validating the returned text. */
export async function callDeepseekChat(messages: DeepseekChatMessage[], temperature = 1): Promise<string> {
  const apiKey = getDeepseekApiKey();
  if (!apiKey) {
    throw new DeepseekRequestError("DEEPSEEK_API_KEY is not configured");
  }

  const response = await fetch(`${DEEPSEEK_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: getDeepseekModel(),
      messages,
      temperature,
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new DeepseekRequestError(`DeepSeek request failed (${response.status}): ${body.slice(0, 300)}`);
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || content.trim() === "") {
    throw new DeepseekRequestError("DeepSeek response had no message content");
  }

  return content;
}
