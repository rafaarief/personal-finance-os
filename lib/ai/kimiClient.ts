/**
 * Moonshot AI (Kimi) client — OpenAI-compatible chat completions API.
 * Base URL / auth format per https://platform.kimi.ai/docs/api/overview.
 * Mirrors the lazy-singleton, null-if-unset shape of anthropicClient.ts.
 */
const KIMI_BASE_URL = "https://api.moonshot.ai/v1";

export function getKimiApiKey(): string | null {
  return process.env.KIMI_API_KEY || null;
}

export function getKimiModel(): string {
  return process.env.KIMI_MODEL || "kimi-k2.6";
}

interface KimiChatMessage {
  role: "system" | "user";
  content: string;
}

export class KimiRequestError extends Error {}

/** Plain chat completion — callers are responsible for parsing/validating the returned text. */
export async function callKimiChat(messages: KimiChatMessage[]): Promise<string> {
  const apiKey = getKimiApiKey();
  if (!apiKey) {
    throw new KimiRequestError("KIMI_API_KEY is not configured");
  }

  const response = await fetch(`${KIMI_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: getKimiModel(),
      messages,
      temperature: 0.4,
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new KimiRequestError(`Kimi request failed (${response.status}): ${body.slice(0, 300)}`);
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || content.trim() === "") {
    throw new KimiRequestError("Kimi response had no message content");
  }

  return content;
}
