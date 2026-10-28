import { AppointmentCard } from "@/components/admin/AppointmentCard";
import { CalendarSyncButton } from "@/components/admin/CalendarSyncButton";
import { DayRegionPicker } from "@/components/admin/DayRegionPicker";
import { filterAppointments, groupByRegion, regionForDay } from "@/lib/regions";
import { getServerSupabase } from "@/lib/supabase/server";
import { dayBoundsUtc, formatDate, formatDuration, todayInTz } from "@/lib/time";
import type { AppointmentWithClient, Region } from "@/lib/types";

export const metadata = { title: "Route" };

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

export default async function AdminRoutePage({ searchParams }: { searchParams: Promise<{ date?: string; region?: string }> }) {
  const sp = await searchParams;
  const today = todayInTz();
  const day = sp.date && DAY_RE.test(sp.date) ? sp.date : today;
  const { start, end } = dayBoundsUtc(day);
  const supabase = await getServerSupabase();

  const [{ data: regionsData }, { data: apptData }] = await Promise.all([
    supabase.from("regions").select("*").eq("is_active", true).order("weekday", { nullsFirst: false }),
    supabase
      .from("appointments")
      .select("*, client:clients(id, full_name, phone, address, preferred_channel)")
      .gte("scheduled_start", start)
      .lt("scheduled_start", end)
      .neq("status", "cancelled")
      .order("scheduled_start"),
  ]);
  const regions = (regionsData ?? []) as Region[];
  const all = (apptData ?? []) as AppointmentWithClient[];

  // Default filter = the day's fixed route; "all" shows everything.
  const routeRegion = regionForDay(day, regions);
  const regionId = sp.region === "all" ? null : (sp.region ?? routeRegion?.id ?? null);
  const appts = filterAppointments(all, { regionId });
  const groups = groupByRegion(appts, regions);

  const done = appts.filter((a) => a.status === "completed");
  const minutes = done.reduce((s, a) => s + (a.duration_minutes ?? 0), 0);

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-xl font-bold">{day === today ? "Today" : formatDate(`${day}T12:00:00Z`, "UTC", "EEEE")}</h1>
          <p className="text-sm text-slate-500">
            {formatDate(`${day}T12:00:00Z`, "UTC", "MMMM d, yyyy")}
            {routeRegion && ` · Route: ${routeRegion.name}`}
          </p>
        </div>
        <CalendarSyncButton compact />
      </div>

      <DayRegionPicker day={day} today={today} regions={regions} regionId={regionId} />

      <dl className="grid grid-cols-3 gap-2 text-center">
        <Summary label="Jobs" value={String(appts.length)} />
        <Summary label="Done" value={`${done.length}/${appts.length}`} />
        <Summary label="Worked" value={formatDuration(minutes)} />
      </dl>

      {groups.length === 0 && (
        <p className="card text-center text-sm text-slate-500">No cleanings on this route. Try “All regions” or sync the calendar.</p>
      )}
      {groups.map(({ region, items }) => (
        <section key={region?.id ?? "none"} className="space-y-3">
          {groups.length > 1 && (
            <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-600">
              <span className="size-2.5 rounded-full" style={{ background: region?.color ?? "#94a3b8" }} />
              {region?.name ?? "No region"}
            </h2>
          )}
          {items.map((a) => (
            <AppointmentCard key={a.id} appt={a} region={region} />
          ))}
        </section>
      ))}
    </div>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="card p-3">
      <dt className="text-[11px] tracking-wide text-slate-500 uppercase">{label}</dt>
      <dd className="text-lg font-bold tabular-nums">{value}</dd>
    </div>
  );
}
