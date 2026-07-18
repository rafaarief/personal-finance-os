import { GlassCard } from "./ui/GlassCard";

interface AIReviewCardProps {
  summary: string;
  recommendation: string | null;
}

export function AIReviewCard({ summary, recommendation }: AIReviewCardProps) {
  return (
    <GlassCard>
      <h2 className="font-(family-name:--font-display) text-xl text-(--color-ink-primary)">AI Financial Review</h2>
      <p className="mt-4 text-sm leading-relaxed text-(--color-ink-secondary)">{summary}</p>
      {recommendation ? (
        <div className="mt-4 rounded-2xl border border-(--color-border-hairline) bg-(--color-surface) p-4">
          <p className="text-xs tracking-[0.15em] text-(--color-cat-purple) uppercase">Recommendation</p>
          <p className="mt-1.5 text-sm text-(--color-ink-primary)">{recommendation}</p>
        </div>
      ) : null}
    </GlassCard>
  );
}
