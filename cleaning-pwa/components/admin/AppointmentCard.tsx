"use client";

import { Clock, LogIn, LogOut, MapPin, MessageCircle, RotateCcw, Timer } from "lucide-react";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useApi } from "@/hooks/useApi";
import { useElapsed } from "@/hooks/useElapsed";
import { whatsappLink } from "@/lib/notifications/whatsapp";
import { formatClock, formatDate, formatDuration, formatTime } from "@/lib/time";
import type { AppointmentWithClient, Region } from "@/lib/types";

export function AppointmentCard({ appt, region }: { appt: AppointmentWithClient; region: Region | null }) {
  const { post, busy, error } = useApi();
  const running = appt.status === "in_progress";
  const elapsed = useElapsed(appt.check_in_at, running);
  const address = appt.location ?? appt.client?.address ?? null;

  const timer = (action: "check_in" | "check_out" | "undo") => {
    if (action === "undo" && !confirm("Undo check-in? The arrival time will be cleared.")) return;
    post(`/api/appointments/${appt.id}/timer`, { action });
  };

  const reminder =
    appt.client?.phone &&
    whatsappLink(
      appt.client.phone,
      `Hi ${appt.client.full_name.split(" ")[0]}! Reminder: your cleaning is on ${formatDate(appt.scheduled_start)} at ${formatTime(appt.scheduled_start)}. See you then!`,
    );

  return (
    <article className="card space-y-3" style={{ borderLeft: `4px solid ${region?.color ?? "#cbd5e1"}` }}>
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-base font-semibold">{appt.client?.full_name ?? appt.title}</h3>
          <p className="flex items-center gap-1 text-sm text-slate-500">
            <Clock className="size-3.5" aria-hidden />
            {formatTime(appt.scheduled_start)} – {formatTime(appt.scheduled_end)}
          </p>
          {!appt.client && <p className="mt-1 text-xs font-medium text-amber-700">⚠ Not linked to a client</p>}
        </div>
        <StatusBadge status={appt.status} />
      </header>

      {address && (
        <a
          href={`https://maps.google.com/?q=${encodeURIComponent(address)}`}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-1.5 text-sm text-brand-700 underline-offset-2 hover:underline"
        >
          <MapPin className="size-4 shrink-0" aria-hidden />
          <span className="truncate">{address}</span>
        </a>
      )}

      {/* Time tracker */}
      <dl className="grid grid-cols-3 gap-2 rounded-xl bg-slate-50 p-3 text-center">
        <div>
          <dt className="text-[11px] tracking-wide text-slate-500 uppercase">Arrival</dt>
          <dd className="text-sm font-semibold tabular-nums">{formatTime(appt.check_in_at)}</dd>
        </div>
        <div>
          <dt className="text-[11px] tracking-wide text-slate-500 uppercase">Departure</dt>
          <dd className="text-sm font-semibold tabular-nums">{formatTime(appt.check_out_at)}</dd>
        </div>
        <div>
          <dt className="text-[11px] tracking-wide text-slate-500 uppercase">Duration</dt>
          <dd className={`text-sm font-semibold tabular-nums ${running ? "text-sky-700" : ""}`} suppressHydrationWarning>
            {running ? formatClock(elapsed) : formatDuration(appt.duration_minutes)}
          </dd>
        </div>
      </dl>

      {error && <p className="text-sm text-rose-600" role="alert">{error}</p>}

      <div className="flex gap-2">
        {appt.status === "scheduled" && (
          <button className="btn-primary flex-1 text-base" disabled={busy} onClick={() => timer("check_in")}>
            <LogIn className="size-5" /> Check in
          </button>
        )}
        {running && (
          <>
            <button className="btn-danger flex-1 text-base" disabled={busy} onClick={() => timer("check_out")}>
              <LogOut className="size-5" /> Check out
            </button>
            <button className="btn-secondary" disabled={busy} onClick={() => timer("undo")} aria-label="Undo check-in">
              <RotateCcw className="size-4" />
            </button>
          </>
        )}
        {appt.status === "completed" && (
          <p className="flex flex-1 items-center gap-1.5 text-sm text-emerald-700">
            <Timer className="size-4" /> Worked {formatDuration(appt.duration_minutes)}
          </p>
        )}
        {reminder && appt.status === "scheduled" && (
          <a href={reminder} target="_blank" rel="noreferrer" className="btn-secondary" aria-label="Send WhatsApp reminder">
            <MessageCircle className="size-4 text-emerald-600" />
          </a>
        )}
      </div>
    </article>
  );
}
