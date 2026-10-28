"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, CalendarDays, Home, Receipt, Settings, Wallet, type LucideIcon } from "lucide-react";

const ICONS = { calendar: CalendarDays, wallet: Wallet, chart: BarChart3, settings: Settings, home: Home, receipt: Receipt } satisfies Record<string, LucideIcon>;

export interface NavItem {
  href: string;
  label: string;
  icon: keyof typeof ICONS;
  badge?: number;
}

export function BottomNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  return (
    <nav className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 backdrop-blur">
      <ul className="mx-auto grid max-w-lg" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
        {items.map(({ href, label, icon, badge }) => {
          const Icon = ICONS[icon];
          const active = href === pathname || (href !== "/admin" && href !== "/portal" && pathname.startsWith(href));
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={`relative flex flex-col items-center gap-0.5 pt-2 text-[11px] font-medium ${active ? "text-brand-700" : "text-slate-500"}`}
              >
                <Icon className="size-6" strokeWidth={active ? 2.4 : 1.8} aria-hidden />
                {label}
                {!!badge && (
                  <span className="absolute top-1 right-[calc(50%-20px)] min-w-4 rounded-full bg-rose-600 px-1 text-[10px] leading-4 text-white">
                    {badge}
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
