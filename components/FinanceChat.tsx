"use client";

import { useRef, useState, useEffect } from "react";
import { GlassCard } from "./ui/GlassCard";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export function FinanceChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, isSending]);

  async function sendMessage() {
    const content = input.trim();
    if (!content || isSending) return;

    const nextMessages: ChatMessage[] = [...messages, { role: "user", content }];
    setMessages(nextMessages);
    setInput("");
    setError(null);
    setIsSending(true);

    try {
      const response = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: nextMessages }),
      });

      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(body.error ?? "Chat request failed");
      }

      setMessages([...nextMessages, { role: "assistant", content: body.reply }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setIsSending(false);
    }
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      sendMessage();
    }
  }

  return (
    <GlassCard>
      <div className="flex items-center justify-between">
        <h2 className="font-(family-name:--font-display) text-xl text-(--color-ink-primary)">
          Ask Kimi about your finances
        </h2>
        {messages.length > 0 ? (
          <button
            type="button"
            onClick={() => setMessages([])}
            className="text-xs tracking-[0.1em] text-(--color-ink-muted) uppercase hover:text-(--color-ink-primary)"
          >
            Clear
          </button>
        ) : null}
      </div>

      <div
        ref={scrollRef}
        className="mt-4 max-h-96 min-h-32 space-y-3 overflow-y-auto rounded-2xl border border-(--color-border-hairline) bg-(--color-surface) p-4"
      >
        {messages.length === 0 ? (
          <p className="text-sm text-(--color-ink-muted)">
            Ask about your net worth, allocation, spending, or anything else in your dashboard —
            e.g. &ldquo;Am I over-allocated in business assets?&rdquo; or &ldquo;What was my biggest
            expense last month?&rdquo;
          </p>
        ) : (
          messages.map((message, index) => (
            <div
              key={index}
              className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
                  message.role === "user"
                    ? "text-(--color-on-accent)"
                    : "border border-(--color-border-hairline) bg-(--color-surface-raised) text-(--color-ink-secondary)"
                }`}
                style={message.role === "user" ? { background: "var(--gradient-hero)" } : undefined}
              >
                {message.content}
              </div>
            </div>
          ))
        )}
        {isSending ? (
          <div className="flex justify-start">
            <div className="rounded-2xl border border-(--color-border-hairline) bg-(--color-surface-raised) px-4 py-2.5 text-sm text-(--color-ink-muted)">
              Thinking...
            </div>
          </div>
        ) : null}
      </div>

      {error ? <p className="mt-2 text-sm text-(--color-status-critical)">{error}</p> : null}

      <div className="mt-3 flex items-end gap-2">
        <textarea
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask about your financial position..."
          rows={1}
          className="min-h-11 flex-1 resize-none rounded-xl border border-(--color-border-hairline) bg-(--color-surface) px-3 py-2.5 text-sm text-(--color-ink-primary)"
        />
        <button
          type="button"
          onClick={sendMessage}
          disabled={isSending || !input.trim()}
          className="rounded-2xl px-5 py-2.5 text-sm font-medium text-(--color-on-accent) disabled:opacity-50"
          style={{ background: "var(--gradient-hero)" }}
        >
          Send
        </button>
      </div>
    </GlassCard>
  );
}
