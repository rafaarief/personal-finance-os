import type { ReactNode } from "react";

export function GlassCard({
  children,
  className = "",
  padded = true,
}: {
  children: ReactNode;
  className?: string;
  padded?: boolean;
}) {
  return <div className={`glass-card ${padded ? "p-6" : ""} ${className}`}>{children}</div>;
}
