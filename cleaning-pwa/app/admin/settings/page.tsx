import { formatDistanceToNow } from "date-fns";
import { MessageCircle } from "lucide-react";
import { CalendarSyncButton } from "@/components/admin/CalendarSyncButton";
import { getNotificationSettings } from "@/lib/notifications/dispatch";
import { whatsappLink } from "@/lib/notifications/whatsapp";
import { getServerSupabase } from "@/lib/supabase/server";
import type { Region } from "@/lib/types";
import { saveNotificationSettings, saveRegion, toggleRegion } from "./actions";

export const metadata = { title: "Settings" };

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export default async function SettingsPage() {
  const supabase = await getServerSupabase();
  const since = new Date(Date.now() - 48 * 3_600_000).toISOString();
  const [{ data: regions }, settings, { data: sync }, { data: log }] = await Promise.all([
    supabase.from("regions").select("*").order("weekday", { nullsFirst: false }),
    getNotificationSettings(supabase),
    supabase.from("app_settings").select("value").eq("key", "calendar_sync").maybeSingle(),
    supabase.from("notification_log").select("id, channel, recipient, template, body, status, error, created_at").gte("created_at", since).order("created_at", { ascending: false }).limit(50),
  ]);
  const lastSynced = (sync?.value as { last_synced_at?: string } | null)?.last_synced_at;
  const manualQueue = (log ?? []).filter((l) => l.status === "link_generated");

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">Settings</h1>

      <section className="card space-y-3">
        <h2 className="font-semibold">Google Calendar</h2>
        <p className="text-sm text-slate-500">
          Auto-sync every 30 min. Last sync: {lastSynced ? formatDistanceToNow(new Date(lastSynced), { addSuffix: true }) : "never"}.
          Tag events with a region tag (e.g. <code>#north</code>) to override the weekday route.
        </p>
        <CalendarSyncButton />
      </section>

      <section className="card space-y-3">
        <h2 className="font-semibold">Routes & regions</h2>
        <ul className="divide-y divide-slate-100">
          {((regions ?? []) as Region[]).map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-2 py-2">
              <span className="flex min-w-0 items-center gap-2">
                <span className="size-3 shrink-0 rounded-full" style={{ background: r.color }} />
                <span className="min-w-0">
                  <span className={`block truncate text-sm font-medium ${r.is_active ? "" : "text-slate-400 line-through"}`}>{r.name}</span>
                  <span className="block text-xs text-slate-500">
                    {r.weekday != null ? WEEKDAYS[r.weekday] : "No fixed day"}
                    {r.calendar_tag && ` · ${r.calendar_tag}`}
                  </span>
                </span>
              </span>
              <form action={toggleRegion.bind(null, r.id, !r.is_active)}>
                <button className="text-xs font-medium text-brand-700">{r.is_active ? "Disable" : "Enable"}</button>
              </form>
            </li>
          ))}
        </ul>
        <form action={saveRegion} className="grid grid-cols-2 gap-2">
          <input name="name" required placeholder="Region name" className="input col-span-2" />
          <select name="weekday" className="input" defaultValue="">
            <option value="">No fixed day</option>
            {WEEKDAYS.map((d, i) => (
              <option key={d} value={i}>{d}</option>
            ))}
          </select>
          <input name="calendar_tag" placeholder="#tag" className="input" />
          <input name="color" type="color" defaultValue="#0d9488" className="input p-1" aria-label="Color" />
          <button className="btn-primary">Add region</button>
        </form>
      </section>

      <section className="card space-y-3">
        <h2 className="font-semibold">Automated notifications</h2>
        <form action={saveNotificationSettings} className="space-y-3 text-sm">
          <Toggle name="reminder_24h" label="Cleaning reminder 24h before" checked={settings.reminder_24h} />
          <Toggle name="overdue_reminders" label="Overdue balance reminders" checked={settings.overdue_reminders} />
          <Toggle name="receipt_alerts" label="Alert me when a receipt is uploaded" checked={settings.receipt_alerts} />
          <label className="flex items-center justify-between gap-2">
            Repeat overdue reminder every
            <span className="flex items-center gap-1">
              <input name="overdue_reminder_every_days" type="number" min={1} defaultValue={settings.overdue_reminder_every_days} className="input w-16" />
              days
            </span>
          </label>
          <button className="btn-secondary w-full">Save</button>
        </form>
      </section>

      {manualQueue.length > 0 && (
        <section className="card space-y-3">
          <h2 className="font-semibold">WhatsApp — tap to send</h2>
          <p className="text-xs text-slate-500">WhatsApp Cloud API isn’t configured, so these reminders open WhatsApp with the message pre-filled.</p>
          <ul className="space-y-2">
            {manualQueue.map((l) => (
              <li key={l.id}>
                <a href={whatsappLink(l.recipient, l.body)} target="_blank" rel="noreferrer" className="btn-secondary w-full justify-start">
                  <MessageCircle className="size-4 text-emerald-600" />
                  <span className="truncate">{l.template.replaceAll("_", " ")} → {l.recipient}</span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="card space-y-2">
        <h2 className="font-semibold">Recent notifications (48h)</h2>
        <ul className="divide-y divide-slate-100 text-sm">
          {(log ?? []).map((l) => (
            <li key={l.id} className="py-2">
              <p className="flex justify-between gap-2">
                <span className="font-medium">{l.template.replaceAll("_", " ")}</span>
                <span className={l.status === "failed" ? "text-rose-600" : "text-slate-500"}>{l.channel} · {l.status}</span>
              </p>
              <p className="truncate text-xs text-slate-500">{l.error ?? l.recipient}</p>
            </li>
          ))}
          {!log?.length && <li className="py-2 text-slate-500">Nothing sent yet.</li>}
        </ul>
      </section>
    </div>
  );
}

function Toggle({ name, label, checked }: { name: string; label: string; checked: boolean }) {
  return (
    <label className="flex items-center justify-between gap-2">
      {label}
      <input type="checkbox" name={name} defaultChecked={checked} className="size-5 accent-brand-600" />
    </label>
  );
}
