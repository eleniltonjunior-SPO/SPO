import type { Appointment, Region } from "./types.ts";
import { weekdayOf, weekdayOfInstant } from "./time.ts";

const normalize = (s: string) => s.toLowerCase().trim();

/**
 * Resolve the region of a calendar event.
 * 1. Explicit tag in title/description (e.g. "#north") wins.
 * 2. Otherwise the fixed weekday route (Monday = Region A, ...).
 */
export function resolveRegion(
  event: { title: string; description?: string | null; start: string },
  regions: Region[],
): Region | null {
  const active = regions.filter((r) => r.is_active);
  const haystack = normalize(`${event.title} ${event.description ?? ""}`);

  const tagged = active.find((r) => r.calendar_tag && haystack.includes(normalize(r.calendar_tag)));
  if (tagged) return tagged;

  const weekday = weekdayOfInstant(event.start);
  return active.find((r) => r.weekday === weekday) ?? null;
}

/** The region scheduled for a given local day ("YYYY-MM-DD"). */
export function regionForDay(day: string, regions: Region[]): Region | null {
  const weekday = weekdayOf(day);
  return regions.find((r) => r.is_active && r.weekday === weekday) ?? null;
}

export interface AppointmentFilter {
  regionId?: string | null;
  statuses?: Appointment["status"][];
}

export function filterAppointments<T extends Appointment>(items: T[], filter: AppointmentFilter): T[] {
  return items
    .filter((a) => !filter.regionId || a.region_id === filter.regionId)
    .filter((a) => !filter.statuses?.length || filter.statuses.includes(a.status))
    .sort((a, b) => a.scheduled_start.localeCompare(b.scheduled_start));
}

/** Group appointments by region, preserving region order; unassigned go last. */
export function groupByRegion<T extends Appointment>(
  items: T[],
  regions: Region[],
): { region: Region | null; items: T[] }[] {
  const groups = new Map<string | null, T[]>();
  for (const a of items) {
    const key = a.region_id ?? null;
    groups.set(key, [...(groups.get(key) ?? []), a]);
  }
  const ordered: { region: Region | null; items: T[] }[] = regions
    .filter((r) => groups.has(r.id))
    .map((r) => ({ region: r, items: groups.get(r.id)! }));
  if (groups.has(null)) ordered.push({ region: null, items: groups.get(null)! });
  return ordered;
}
