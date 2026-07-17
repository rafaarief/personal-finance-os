"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Wealth" },
  { href: "/assets", label: "Assets" },
  { href: "/import", label: "Import" },
  { href: "/transactions", label: "Transactions" },
  { href: "/expenses", label: "Expenses" },
  { href: "/investments", label: "Investments" },
  { href: "/cashflow", label: "Cashflow" },
  { href: "/settings", label: "Settings" },
];

export function NavBar() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-10 border-b border-(--color-border-hairline) bg-(--color-plane)/80 backdrop-blur-xl">
      <div className="mx-auto flex max-w-6xl items-center gap-6 px-6 py-4">
        <Link href="/dashboard" className="font-(family-name:--font-display) text-lg text-(--color-ink-primary)">
          PFOS
        </Link>

        <nav className="flex flex-1 flex-wrap gap-1">
          {NAV_ITEMS.map((item) => {
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
      </div>
    </header>
  );
}
