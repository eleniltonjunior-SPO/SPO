"use client";

import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { format, parseISO } from "date-fns";
import { shiftDay } from "@/lib/time";
import type { Region } from "@/lib/types";

/** Week strip + region chips. State lives in the URL (?date=YYYY-MM-DD&region=<id|all>). */
export function DayRegionPicker({ day, today, regions, regionId }: { day: string; today: string; regions: Region[]; regionId: string | null }) {
  const params = useSearchParams();
  const href = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) (v === null ? next.delete(k) : next.set(k, v));
    return `?${next}`;
  };

  // Mon–Sun of the selected day's week
  const offset = (parseISO(day).getDay() + 6) % 7;
  const week = Array.from({ length: 7 }, (_, i) => shiftDay(day, i - offset));
  const regionOf = (d: string) => regions.find((r) => r.weekday === parseISO(d).getDay());

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1">
        <Link href={href({ date: shiftDay(day, -7), region: null })} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="Previous week">
          <ChevronLeft className="size-5" />
        </Link>
        <ol className="grid flex-1 grid-cols-7 gap-1">
          {week.map((d) => {
            const selected = d === day;
            const r = regionOf(d);
            return (
              <li key={d}>
                <Link
                  href={href({ date: d, region: null })}
                  aria-current={selected ? "date" : undefined}
                  className={`flex flex-col items-center rounded-xl py-1.5 text-xs ${selected ? "bg-brand-600 text-white" : "text-slate-600 hover:bg-slate-100"}`}
                >
                  <span className="font-medium">{format(parseISO(d), "EEEEE")}</span>
                  <span className={`text-base font-bold ${d === today && !selected ? "text-brand-700" : ""}`}>{format(parseISO(d), "d")}</span>
                  <span className="mt-0.5 size-1.5 rounded-full" style={{ background: r ? (selected ? "#fff" : r.color) : "transparent" }} />
                </Link>
              </li>
            );
          })}
        </ol>
        <Link href={href({ date: shiftDay(day, 7), region: null })} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="Next week">
          <ChevronRight className="size-5" />
        </Link>
      </div>

      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
        <Chip href={href({ region: "all" })} active={regionId === null} label="All regions" />
        {regions.map((r) => (
          <Chip key={r.id} href={href({ region: r.id })} active={regionId === r.id} label={r.name} color={r.color} />
        ))}
      </div>
    </div>
  );
}

function Chip({ href, active, label, color }: { href: string; active: boolean; label: string; color?: string }) {
  return (
    <Link
      href={href}
      className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium ${
        active ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-700"
      }`}
    >
      {color && <span className="size-2 rounded-full" style={{ background: color }} />}
      {label}
    </Link>
  );
}
