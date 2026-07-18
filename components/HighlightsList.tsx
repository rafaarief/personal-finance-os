import type { Highlight } from "@/lib/finance/insights";
import { GlassCard } from "./ui/GlassCard";

const STATUS_DOT: Record<Highlight["status"], string> = {
  good: "🟢",
  warning: "🟡",
  critical: "🔴",
};

export function HighlightsList({ highlights }: { highlights: Highlight[] }) {
  return (
    <GlassCard>
      <h2 className="font-(family-name:--font-display) text-xl text-(--color-ink-primary)">Today's Highlights</h2>
      <ul className="mt-4 space-y-2.5 text-sm">
        {highlights.map((highlight, index) => (
          <li key={index} className="flex items-start gap-2 text-(--color-ink-secondary)">
            <span aria-hidden>{STATUS_DOT[highlight.status]}</span>
            <span>{highlight.text}</span>
          </li>
        ))}
      </ul>
    </GlassCard>
  );
}
