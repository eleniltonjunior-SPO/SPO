import { NextResponse } from "next/server";
import { guardApi } from "@/lib/auth";
import { annotateEvent } from "@/lib/google-calendar";
import { dbError } from "@/lib/http";
import { formatDuration, formatTime } from "@/lib/time";
import type { Appointment } from "@/lib/types";

const RPC = { check_in: "check_in", check_out: "check_out", undo: "undo_check_in" } as const;
type Action = keyof typeof RPC;

/** POST { action: "check_in" | "check_out" | "undo" } — one-tap time tracking. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await guardApi("admin");
  if (!guard.ok) return guard.response;

  const { id } = await params;
  const { action } = (await req.json().catch(() => ({}))) as { action?: Action };
  if (!action || !(action in RPC)) return NextResponse.json({ error: "Invalid action" }, { status: 400 });

  const { data, error } = await guard.supabase.rpc(RPC[action], { p_appointment_id: id });
  if (error) return dbError(error);
  const appt = data as Appointment;

  // Mirror tracked times onto the Google Calendar event without blocking the response path on failure.
  if (appt.google_event_id && action !== "undo") {
    await annotateEvent(appt.google_event_id, {
      checkIn: formatTime(appt.check_in_at),
      checkOut: appt.check_out_at ? formatTime(appt.check_out_at) : null,
      duration: appt.duration_minutes != null ? formatDuration(appt.duration_minutes) : undefined,
    }).catch((e) => console.error("annotateEvent failed", e));
  }

  return NextResponse.json({ appointment: appt });
}
