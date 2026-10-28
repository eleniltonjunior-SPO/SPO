import { CalendarDays } from "lucide-react";
import { LiveAttendance } from "@/components/portal/LiveAttendance";
import { ReceiptUpload } from "@/components/portal/ReceiptUpload";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { getCurrentClient } from "@/lib/auth";
import { getServerSupabase } from "@/lib/supabase/server";
import { formatDate, formatDuration, formatMoney, formatTime } from "@/lib/time";
import type { Appointment, Payment, Receipt } from "@/lib/types";

export const metadata = { title: "My cleanings" };

type PaymentWithAppt = Payment & { appointment: Pick<Appointment, "scheduled_start" | "duration_minutes"> | null; receipts: Receipt[] };

export default async function PortalPage() {
  const client = await getCurrentClient();
  if (!client) {
    return <p className="card text-sm">Your account isn’t linked to a client profile yet. Please contact us.</p>;
  }

  const supabase = await getServerSupabase();
  const now = new Date().toISOString();
  // RLS limits every query to this client's rows.
  const [{ data: recent }, { data: upcoming }, { data: payments }] = await Promise.all([
    supabase
      .from("appointments")
      .select("*")
      .in("status", ["in_progress", "completed"])
      .order("scheduled_start", { ascending: false })
      .limit(5),
    supabase
      .from("appointments")
      .select("id, scheduled_start, scheduled_end, status")
      .eq("status", "scheduled")
      .gte("scheduled_start", now)
      .order("scheduled_start")
      .limit(8),
    supabase
      .from("payments")
      .select("*, appointment:appointments(scheduled_start, duration_minutes), receipts(*)")
      .order("due_date", { ascending: false })
      .limit(24),
  ]);

  const visits = (recent ?? []) as Appointment[];
  const latest = visits.find((a) => a.status === "in_progress") ?? visits[0] ?? null;
  const rows = (payments ?? []) as PaymentWithAppt[];
  const open = rows.filter((p) => p.status !== "paid");
  const balance = open.reduce((s, p) => s + Number(p.amount), 0);

  return (
    <>
      <LiveAttendance initial={latest} clientId={client.id} />

      {/* Billing */}
      <section className="space-y-3">
        <div className={`card flex items-center justify-between ${balance > 0 ? "bg-amber-50" : "bg-emerald-50"}`}>
          <div>
            <p className="text-xs text-slate-600">{balance > 0 ? "Outstanding balance" : "You're all paid up"}</p>
            <p className="text-2xl font-bold tabular-nums">{formatMoney(balance)}</p>
          </div>
          <StatusBadge status={open.some((p) => p.status === "overdue") ? "overdue" : balance > 0 ? "pending" : "paid"} />
        </div>

        <h2 className="text-lg font-bold">Payments</h2>
        <ul className="space-y-3">
          {rows.map((p) => {
            const lastReceipt = [...(p.receipts ?? [])].sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
            const awaitingReview = lastReceipt?.status === "submitted";
            return (
              <li key={p.id} className="card space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold">
                      {p.appointment ? `Cleaning ${formatDate(p.appointment.scheduled_start)}` : "Cleaning"}
                    </p>
                    <p className="text-xs text-slate-500">
                      {p.appointment?.duration_minutes != null && `${formatDuration(p.appointment.duration_minutes)} · `}
                      {p.status === "paid" && p.paid_at ? `Paid ${formatDate(p.paid_at)}` : `Due ${formatDate(`${p.due_date}T12:00:00Z`)}`}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold tabular-nums">{formatMoney(Number(p.amount))}</p>
                    <StatusBadge status={p.status} />
                  </div>
                </div>

                {lastReceipt && p.status !== "paid" && (
                  <p className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-xs">
                    <span className="truncate">Receipt: {lastReceipt.file_name}</span>
                    <StatusBadge status={lastReceipt.status} />
                  </p>
                )}
                {lastReceipt?.status === "rejected" && lastReceipt.review_note && (
                  <p className="text-xs text-rose-700">Note: {lastReceipt.review_note}</p>
                )}
                {p.status !== "paid" && !awaitingReview && <ReceiptUpload clientId={client.id} paymentId={p.id} />}
              </li>
            );
          })}
          {!rows.length && <li className="card text-center text-sm text-slate-500">No invoices yet.</li>}
        </ul>
      </section>

      {/* Upcoming schedule (read-only) */}
      <section className="space-y-3">
        <h2 className="text-lg font-bold">Upcoming cleanings</h2>
        <ul className="card divide-y divide-slate-100 p-0">
          {(upcoming ?? []).map((a) => (
            <li key={a.id} className="flex items-center gap-3 px-4 py-3">
              <span className="flex size-11 shrink-0 flex-col items-center justify-center rounded-xl bg-brand-50 text-brand-700">
                <span className="text-[10px] font-semibold uppercase">{formatDate(a.scheduled_start, undefined, "MMM")}</span>
                <span className="text-base leading-none font-bold">{formatDate(a.scheduled_start, undefined, "d")}</span>
              </span>
              <span>
                <span className="block font-medium">{formatDate(a.scheduled_start, undefined, "EEEE")}</span>
                <span className="block text-sm text-slate-500">
                  {formatTime(a.scheduled_start)} – {formatTime(a.scheduled_end)}
                </span>
              </span>
            </li>
          ))}
          {!upcoming?.length && (
            <li className="flex items-center gap-2 px-4 py-6 text-sm text-slate-500">
              <CalendarDays className="size-4" /> No upcoming cleanings scheduled.
            </li>
          )}
        </ul>
      </section>
    </>
  );
}
