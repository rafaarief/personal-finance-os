import { NextResponse } from "next/server";
import { z } from "zod";
import { callKimiChat, getKimiApiKey, KimiRequestError, type KimiChatMessage } from "@/lib/ai/kimiClient";
import { buildFinancialContext } from "@/lib/ai/chatContext";

const chatRequestSchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1).max(4000),
      })
    )
    .min(1)
    .max(40),
});

const SYSTEM_PROMPT_PREFIX = `You are a knowledgeable personal financial advisor having a conversation with the owner of this dashboard about their own finances. You have been given a JSON snapshot of their real financial data below (all monetary amounts are in IDR) — their net worth, asset list, allocation, recent transactions, recurring expenses, and computed signals.

Ground every answer in these actual numbers; reference specific figures. If the user asks about something not present in the data, say so plainly instead of guessing or inventing figures. Be direct and concrete — give real opinions and actionable recommendations, not generic platitudes like "keep saving." Keep responses conversational and reasonably concise (a few short paragraphs at most, or a short list) unless the user asks for depth.

Financial data snapshot:
`;

export async function POST(request: Request) {
  if (!getKimiApiKey()) {
    return NextResponse.json(
      { error: "KIMI_API_KEY is not configured on the server" },
      { status: 503 }
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = chatRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  try {
    const contextJson = await buildFinancialContext();
    const systemPrompt = `${SYSTEM_PROMPT_PREFIX}${contextJson}`;

    const messages: KimiChatMessage[] = [
      { role: "system", content: systemPrompt },
      ...parsed.data.messages,
    ];

    const reply = await callKimiChat(messages);
    return NextResponse.json({ reply });
  } catch (error) {
    const message = error instanceof KimiRequestError ? error.message : "Chat request failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
