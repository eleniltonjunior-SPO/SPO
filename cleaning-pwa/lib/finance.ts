import { format, startOfISOWeek } from "date-fns";
import { formatInTimeZone, toZonedTime } from "date-fns-tz";
import type { LedgerRow } from "./types.ts";
import { BUSINESS_TZ } from "./config.ts";

export type ReportPeriod = "week" | "month";

export interface ReportBucket {
  key: string; // "2026-10" or "2026-10-26" (Monday of ISO week)
  label: string;
  jobs: number;
  minutes: number;
  billed: number; // revenue earned (accrual)
  collected: number; // paid
  pending: number;
  overdue: number;
  effectiveHourly: number; // billed / hours
}

export interface OutstandingByClient {
  clientId: string;
  clientName: string;
  pending: number;
  overdue: number;
  total: number;
  oldestDue: string | null;
}

export interface FinancialReport {
  period: ReportPeriod;
  buckets: ReportBucket[];
  totals: Omit<ReportBucket, "key" | "label">;
  outstanding: { pending: number; overdue: number; total: number; byClient: OutstandingByClient[] };
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function bucketKey(iso: string, period: ReportPeriod, tz = BUSINESS_TZ): string {
  if (period === "month") return formatInTimeZone(iso, tz, "yyyy-MM");
  // toZonedTime yields a Date whose local fields are the business wall clock.
  return format(startOfISOWeek(toZonedTime(iso, tz)), "yyyy-MM-dd");
}

function bucketLabel(key: string, period: ReportPeriod): string {
  if (period === "month") {
    const [y, m] = key.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, 15)).toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
  }
  const [y, m, d] = key.split("-").map(Number);
  return `Wk ${new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}`;
}

function emptyBucket(key: string, period: ReportPeriod): ReportBucket {
  return { key, label: bucketLabel(key, period), jobs: 0, minutes: 0, billed: 0, collected: 0, pending: 0, overdue: 0, effectiveHourly: 0 };
}

/**
 * Pure calculator: completed jobs → revenue per week/month, hours vs income,
 * and outstanding receivables. Jobs are bucketed by when the work happened.
 */
export function buildFinancialReport(rows: LedgerRow[], period: ReportPeriod, tz = BUSINESS_TZ): FinancialReport {
  const buckets = new Map<string, ReportBucket>();
  const byClient = new Map<string, OutstandingByClient>();

  for (const row of rows) {
    const workedAt = row.check_in_at ?? row.scheduled_start;
    const key = bucketKey(workedAt, period, tz);
    const b = buckets.get(key) ?? emptyBucket(key, period);
    const amount = Number(row.amount ?? 0);

    b.jobs += 1;
    b.minutes += row.duration_minutes ?? 0;
    b.billed += amount;
    if (row.payment_status === "paid") b.collected += amount;
    if (row.payment_status === "pending") b.pending += amount;
    if (row.payment_status === "overdue") b.overdue += amount;
    buckets.set(key, b);

    if (row.client_id && (row.payment_status === "pending" || row.payment_status === "overdue")) {
      const c = byClient.get(row.client_id) ?? {
        clientId: row.client_id,
        clientName: row.client_name ?? "Unknown",
        pending: 0,
        overdue: 0,
        total: 0,
        oldestDue: null,
      };
      if (row.payment_status === "pending") c.pending += amount;
      else c.overdue += amount;
      c.total += amount;
      if (row.due_date && (!c.oldestDue || row.due_date < c.oldestDue)) c.oldestDue = row.due_date;
      byClient.set(row.client_id, c);
    }
  }

  const sorted = [...buckets.values()]
    .sort((a, b) => a.key.localeCompare(b.key))
    .map((b) => ({
      ...b,
      billed: round2(b.billed),
      collected: round2(b.collected),
      pending: round2(b.pending),
      overdue: round2(b.overdue),
      effectiveHourly: b.minutes > 0 ? round2(b.billed / (b.minutes / 60)) : 0,
    }));

  const totals = sorted.reduce(
    (t, b) => ({
      jobs: t.jobs + b.jobs,
      minutes: t.minutes + b.minutes,
      billed: round2(t.billed + b.billed),
      collected: round2(t.collected + b.collected),
      pending: round2(t.pending + b.pending),
      overdue: round2(t.overdue + b.overdue),
      effectiveHourly: 0,
    }),
    { jobs: 0, minutes: 0, billed: 0, collected: 0, pending: 0, overdue: 0, effectiveHourly: 0 },
  );
  totals.effectiveHourly = totals.minutes > 0 ? round2(totals.billed / (totals.minutes / 60)) : 0;

  const clients = [...byClient.values()]
    .map((c) => ({ ...c, pending: round2(c.pending), overdue: round2(c.overdue), total: round2(c.total) }))
    .sort((a, b) => b.overdue - a.overdue || b.total - a.total);

  return {
    period,
    buckets: sorted,
    totals,
    outstanding: { pending: totals.pending, overdue: totals.overdue, total: round2(totals.pending + totals.overdue), byClient: clients },
  };
}
