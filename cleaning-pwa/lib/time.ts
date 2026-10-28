import { addDays, format, parseISO } from "date-fns";
import { formatInTimeZone, fromZonedTime, toZonedTime } from "date-fns-tz";
import { BUSINESS_TZ } from "./config.ts";

/** Whole minutes between two instants (floored, never negative). */
export function minutesBetween(startIso: string, endIso: string | Date = new Date()): number {
  const end = typeof endIso === "string" ? new Date(endIso) : endIso;
  const diff = end.getTime() - new Date(startIso).getTime();
  return Math.max(0, Math.floor(diff / 60_000));
}

/** 135 → "2h 15m", 45 → "45m". */
export function formatDuration(totalMinutes: number | null | undefined): string {
  if (totalMinutes == null) return "—";
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return h === 0 ? `${m}m` : `${h}h ${String(m).padStart(2, "0")}m`;
}

/** Live stopwatch format "01:23:45". */
export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const hh = String(Math.floor(s / 3600)).padStart(2, "0");
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

export function formatTime(iso: string | null | undefined, tz = BUSINESS_TZ): string {
  return iso ? formatInTimeZone(iso, tz, "h:mm a") : "—";
}

export function formatDate(iso: string, tz = BUSINESS_TZ, pattern = "EEE, MMM d"): string {
  return formatInTimeZone(iso, tz, pattern);
}

/** "YYYY-MM-DD" for today in the business timezone. */
export function todayInTz(tz = BUSINESS_TZ): string {
  return formatInTimeZone(new Date(), tz, "yyyy-MM-dd");
}

/** UTC bounds [start, end) of a local calendar day. */
export function dayBoundsUtc(day: string, tz = BUSINESS_TZ): { start: string; end: string } {
  const start = fromZonedTime(`${day}T00:00:00`, tz);
  const end = fromZonedTime(`${format(addDays(parseISO(day), 1), "yyyy-MM-dd")}T00:00:00`, tz);
  return { start: start.toISOString(), end: end.toISOString() };
}

/** 0 (Sunday) … 6 (Saturday) for a "YYYY-MM-DD" day. */
export function weekdayOf(day: string): number {
  return parseISO(day).getDay();
}

/** Weekday of an instant as seen in the business timezone. */
export function weekdayOfInstant(iso: string, tz = BUSINESS_TZ): number {
  return toZonedTime(iso, tz).getDay();
}

export function shiftDay(day: string, delta: number): string {
  return format(addDays(parseISO(day), delta), "yyyy-MM-dd");
}

export function formatMoney(value: number, currency = process.env.NEXT_PUBLIC_CURRENCY ?? "USD"): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(value);
}
