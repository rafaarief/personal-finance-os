"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { UserRole } from "@/lib/auth/session";

const OWNER_NAV_ITEMS = [
  { href: "/dashboard", label: "Wealth" },
  { href: "/assets", label: "Assets" },
  { href: "/capital-market", label: "Capital Market" },
  { href: "/business", label: "Business" },
  { href: "/cashflow", label: "Cashflow" },
  { href: "/settings", label: "Settings" },
  { href: "/trading", label: "Trading" },
];

const TRADING_USER_NAV_ITEMS = [{ href: "/trading", label: "Trading Recap" }];

export function NavBar({ role }: { role: UserRole }) {
  const pathname = usePathname();
  const router = useRouter();
  const isTradingUser = role === "TRADING_USER";
  const navItems = isTradingUser ? TRADING_USER_NAV_ITEMS : OWNER_NAV_ITEMS;

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
  }

  return (
    <header className="sticky top-0 z-10 border-b border-(--color-border-hairline) bg-(--color-plane)/80 backdrop-blur-xl">
      <div className="mx-auto flex max-w-6xl items-center gap-6 px-6 py-4">
        <Link
          href={isTradingUser ? "/trading" : "/dashboard"}
          className="font-(family-name:--font-display) text-lg whitespace-nowrap text-(--color-ink-primary)"
        >
          {isTradingUser ? "PFOS Trading" : "PFOS"}
        </Link>

        <nav className="flex flex-1 flex-wrap gap-1">
          {navItems.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`rounded-full px-3 py-1.5 text-sm transition ${
                  isActive
                    ? "bg-(--color-surface-raised) text-(--color-ink-primary)"
                    : "text-(--color-ink-secondary) hover:text-(--color-ink-primary)"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <button
          onClick={handleLogout}
          className="text-sm text-(--color-ink-muted) transition hover:text-(--color-ink-primary)"
        >
          Sign out
        </button>
      </div>
    </header>
  );
}
