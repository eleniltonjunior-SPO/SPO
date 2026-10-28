"use client";

import { Radio, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useElapsed } from "@/hooks/useElapsed";
import { getBrowserSupabase } from "@/lib/supabase/client";
import { formatClock, formatDate, formatDuration, formatTime } from "@/lib/time";
import type { Appointment } from "@/lib/types";

/**
 * Real-time arrival/departure view. Subscribes to this client's appointment
 * rows (Realtime honours RLS, so only their own rows are delivered).
 */
export function LiveAttendance({ initial, clientId }: { initial: Appointment | null; clientId: string }) {
  const [appt, setAppt] = useState(initial);
  const running = appt?.status === "in_progress";
  const elapsed = useElapsed(appt?.check_in_at ?? null, running);

  useEffect(() => {
    const supabase = getBrowserSupabase();
    const channel = supabase
      .channel(`attendance:${clientId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "appointments", filter: `client_id=eq.${clientId}` },
        (payload) => {
          const next = payload.new as Appointment;
          // Follow the visit currently shown, or switch to one that just started.
          setAppt((cur) => (!cur || cur.id === next.id || next.status === "in_progress" ? next : cur));
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [clientId]);

  if (!appt) {
    return (
      <section className="card text-center text-sm text-slate-500">
        <Sparkles className="mx-auto mb-2 size-6 text-brand-500" />
        No visits recorded yet.
      </section>
    );
  }

  return (
    <section className={`card space-y-3 ${running ? "ring-2 ring-sky-200" : ""}`} aria-live="polite">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-slate-500">{running ? "Cleaning in progress" : "Latest visit"}</p>
          <p className="font-semibold">{formatDate(appt.scheduled_start, undefined, "EEEE, MMM d")}</p>
        </div>
        {running ? (
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-sky-700">
            <Radio className="size-4 animate-pulse" /> LIVE
          </span>
        ) : (
          <StatusBadge status={appt.status} />
        )}
      </div>

      <dl className="grid grid-cols-3 gap-2 text-center">
        <Stat label="Arrived" value={formatTime(appt.check_in_at)} />
        <Stat label="Left" value={formatTime(appt.check_out_at)} />
        <Stat label="Total" value={running ? formatClock(elapsed) : formatDuration(appt.duration_minutes)} highlight={running} />
      </dl>
    </section>
  );
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="rounded-xl bg-slate-50 p-3">
      <dt className="text-[11px] tracking-wide text-slate-500 uppercase">{label}</dt>
      <dd className={`text-lg font-bold tabular-nums ${highlight ? "text-sky-700" : ""}`} suppressHydrationWarning>
        {value}
      </dd>
    </div>
  );
}
