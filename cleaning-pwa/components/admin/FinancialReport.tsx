"use client";

import { AlertTriangle, Clock, DollarSign, Hourglass, TrendingUp } from "lucide-react";
import { useMemo, useState } from "react";
import { buildFinancialReport, type ReportBucket, type ReportPeriod } from "@/lib/finance";
import { formatDuration, formatMoney } from "@/lib/time";
import type { LedgerRow } from "@/lib/types";

export function FinancialReport({ rows }: { rows: LedgerRow[] }) {
  const [period, setPeriod] = useState<ReportPeriod>("month");
  const report = useMemo(() => buildFinancialReport(rows, period), [rows, period]);
  const visible = report.buckets.slice(period === "month" ? -6 : -8);
  const current = visible.at(-1);

  return (
    <div className="space-y-4">
      <div className="flex rounded-xl bg-slate-100 p-1" role="tablist" aria-label="Report period">
        {(["week", "month"] as const).map((p) => (
          <button
            key={p}
            role="tab"
            aria-selected={period === p}
            onClick={() => setPeriod(p)}
            className={`flex-1 rounded-lg py-2 text-sm font-medium capitalize ${period === p ? "bg-white shadow-sm" : "text-slate-500"}`}
          >
            {p === "week" ? "Weekly" : "Monthly"}
          </button>
        ))}
      </div>

      {/* KPI tiles — current period */}
      <section aria-label="Current period" className="grid grid-cols-2 gap-3">
        <Kpi icon={DollarSign} label={`Revenue · ${current?.label ?? "—"}`} value={formatMoney(current?.billed ?? 0)} />
        <Kpi icon={TrendingUp} label="Collected" value={formatMoney(current?.collected ?? 0)} />
        <Kpi icon={Clock} label="Hours worked" value={formatDuration(current?.minutes ?? 0)} />
        <Kpi icon={Hourglass} label="Effective rate" value={`${formatMoney(current?.effectiveHourly ?? 0)}/h`} />
      </section>

      {/* Outstanding summary */}
      <section className="card space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="font-semibold">Outstanding</h2>
          <p className="text-2xl font-bold tabular-nums">{formatMoney(report.outstanding.total)}</p>
        </div>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <p className="rounded-xl bg-amber-50 p-2 text-amber-900">
            Pending <span className="block font-semibold tabular-nums">{formatMoney(report.outstanding.pending)}</span>
          </p>
          <p className="rounded-xl bg-rose-50 p-2 text-rose-900">
            <span className="inline-flex items-center gap-1"><AlertTriangle className="size-3.5" aria-hidden /> Overdue</span>
            <span className="block font-semibold tabular-nums">{formatMoney(report.outstanding.overdue)}</span>
          </p>
        </div>
        {report.outstanding.byClient.length > 0 && (
          <ul className="divide-y divide-slate-100 text-sm">
            {report.outstanding.byClient.slice(0, 8).map((c) => (
              <li key={c.clientId} className="flex items-center justify-between py-2">
                <span className="truncate">{c.clientName}</span>
                <span className="tabular-nums">
                  {c.overdue > 0 && <span className="mr-2 text-xs font-medium text-rose-700">{formatMoney(c.overdue)} overdue</span>}
                  <span className="font-semibold">{formatMoney(c.total)}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card space-y-3">
        <h2 className="font-semibold">Revenue by {period}</h2>
        <RevenueBars buckets={visible} />
      </section>

      {/* Table view: hours vs income per period */}
      <section className="card overflow-x-auto p-0">
        <table className="w-full text-sm">
          <caption className="px-4 pt-4 text-left font-semibold">Hours vs income</caption>
          <thead className="text-xs text-slate-500">
            <tr className="border-b border-slate-100">
              <th className="px-4 py-2 text-left font-medium">Period</th>
              <th className="px-2 py-2 text-right font-medium">Jobs</th>
              <th className="px-2 py-2 text-right font-medium">Hours</th>
              <th className="px-2 py-2 text-right font-medium">Revenue</th>
              <th className="px-4 py-2 text-right font-medium">$/h</th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {[...visible].reverse().map((b) => (
              <tr key={b.key} className="border-b border-slate-50 last:border-0">
                <td className="px-4 py-2">{b.label}</td>
                <td className="px-2 py-2 text-right">{b.jobs}</td>
                <td className="px-2 py-2 text-right">{(b.minutes / 60).toFixed(1)}</td>
                <td className="px-2 py-2 text-right">{formatMoney(b.billed)}</td>
                <td className="px-4 py-2 text-right">{formatMoney(b.effectiveHourly)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="font-semibold tabular-nums">
            <tr className="border-t border-slate-200">
              <td className="px-4 py-2">Total</td>
              <td className="px-2 py-2 text-right">{report.totals.jobs}</td>
              <td className="px-2 py-2 text-right">{(report.totals.minutes / 60).toFixed(1)}</td>
              <td className="px-2 py-2 text-right">{formatMoney(report.totals.billed)}</td>
              <td className="px-4 py-2 text-right">{formatMoney(report.totals.effectiveHourly)}</td>
            </tr>
          </tfoot>
        </table>
      </section>
    </div>
  );
}

function Kpi({ icon: Icon, label, value }: { icon: typeof Clock; label: string; value: string }) {
  return (
    <div className="card p-3">
      <p className="flex items-center gap-1.5 text-xs text-slate-500">
        <Icon className="size-3.5" aria-hidden /> {label}
      </p>
      <p className="mt-1 text-xl font-bold tabular-nums">{value}</p>
    </div>
  );
}

/** Single-series bar chart (billed revenue). One hue, baseline-anchored, hover/focus tooltip. */
function RevenueBars({ buckets }: { buckets: ReportBucket[] }) {
  const [active, setActive] = useState<string | null>(null);
  const max = Math.max(1, ...buckets.map((b) => b.billed));
  if (!buckets.length) return <p className="text-sm text-slate-500">No completed jobs yet.</p>;

  return (
    <div className="relative">
      <div className="flex h-40 items-end gap-0.5 border-b border-slate-200" role="list">
        {buckets.map((b) => {
          const isActive = active === b.key;
          return (
            <div
              key={b.key}
              role="listitem"
              tabIndex={0}
              aria-label={`${b.label}: ${formatMoney(b.billed)}, ${(b.minutes / 60).toFixed(1)} hours`}
              onMouseEnter={() => setActive(b.key)}
              onMouseLeave={() => setActive(null)}
              onFocus={() => setActive(b.key)}
              onBlur={() => setActive(null)}
              className="relative flex h-full flex-1 cursor-default items-end justify-center outline-none"
            >
              <div
                className={`w-full max-w-10 rounded-t-[4px] transition-colors ${isActive ? "bg-brand-700" : "bg-brand-500"}`}
                style={{ height: `${Math.max(2, (b.billed / max) * 100)}%` }}
              />
              {isActive && (
                <div className="pointer-events-none absolute bottom-full z-10 mb-1 rounded-lg bg-slate-900 px-2 py-1 text-xs whitespace-nowrap text-white shadow">
                  <p className="font-semibold">{b.label}</p>
                  <p>{formatMoney(b.billed)} · {(b.minutes / 60).toFixed(1)} h</p>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="mt-1 flex gap-0.5 text-[10px] text-slate-500">
        {buckets.map((b) => (
          <span key={b.key} className="flex-1 truncate text-center">{b.label.replace(/^Wk /, "")}</span>
        ))}
      </div>
    </div>
  );
}
