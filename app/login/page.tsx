"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [showEmailField, setShowEmailField] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(showEmailField ? { email, password } : { password }),
    });

    setIsSubmitting(false);

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setError(body.error ?? "Something went wrong");
      return;
    }

    const body = await response.json().catch(() => ({}));
    if (body.role === "TRADING_USER") {
      router.replace("/trading");
      return;
    }
    router.replace(searchParams.get("next") || "/dashboard");
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-6">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 left-1/2 h-[36rem] w-[36rem] -translate-x-1/2 rounded-full opacity-40 blur-[120px]"
        style={{ background: "var(--gradient-hero)" }}
      />

      <div className="glass-card relative w-full max-w-sm p-10">
        <p className="text-sm tracking-[0.2em] text-(--color-ink-muted) uppercase">Personal Finance OS</p>
        <h1 className="mt-3 font-(family-name:--font-display) text-4xl text-(--color-ink-primary)">
          Welcome back
        </h1>
        <p className="mt-2 text-sm text-(--color-ink-secondary)">
          {showEmailField ? "Sign in with your trading account." : "Enter your password to open the dashboard."}
        </p>

        <form onSubmit={handleSubmit} className="mt-8 space-y-4">
          {showEmailField ? (
            <input
              type="email"
              autoFocus
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="Email"
              className="w-full rounded-2xl border border-(--color-border-hairline) bg-(--color-surface) px-4 py-3 text-(--color-ink-primary) outline-none placeholder:text-(--color-ink-muted) focus:border-(--color-cat-purple)"
            />
          ) : null}

          <input
            type="password"
            autoFocus={!showEmailField}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Password"
            className="w-full rounded-2xl border border-(--color-border-hairline) bg-(--color-surface) px-4 py-3 text-(--color-ink-primary) outline-none placeholder:text-(--color-ink-muted) focus:border-(--color-cat-purple)"
          />

          {error ? <p className="text-sm text-(--color-status-critical)">{error}</p> : null}

          <button
            type="submit"
            disabled={isSubmitting || password.length === 0 || (showEmailField && email.length === 0)}
            className="w-full rounded-2xl px-4 py-3 font-medium text-(--color-on-accent) transition disabled:opacity-50"
            style={{ background: "var(--gradient-hero)" }}
          >
            {isSubmitting ? "Signing in..." : "Sign in"}
          </button>

          <button
            type="button"
            onClick={() => setShowEmailField((current) => !current)}
            className="w-full text-center text-xs text-(--color-ink-muted) hover:text-(--color-ink-secondary)"
          >
            {showEmailField ? "Back to owner sign in" : "Trading account? Sign in with email"}
          </button>
        </form>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
