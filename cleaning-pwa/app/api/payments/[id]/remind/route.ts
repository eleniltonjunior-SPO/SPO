import { NextResponse } from "next/server";
import { guardApi } from "@/lib/auth";
import { notifyClient } from "@/lib/notifications/dispatch";
import { getAdminSupabase } from "@/lib/supabase/admin";

/**
 * POST — send an overdue reminder for the client owning this payment now.
 * Returns `link` when WhatsApp falls back to a deep link the admin must tap.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await guardApi("admin");
  if (!guard.ok) return guard.response;
  const { id } = await params;

  const { data: payment } = await guard.supabase
    .from("payments")
    .select("id, client_id, client:clients(id, full_name, email, phone, preferred_channel)")
    .eq("id", id)
    .single();
  const client = payment?.client as unknown as { id: string; full_name: string; email: string | null; phone: string | null; preferred_channel: "whatsapp" | "email" | "sms" } | null;
  if (!payment || !client) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { data: open } = await guard.supabase
    .from("payments")
    .select("id, amount")
    .eq("client_id", payment.client_id)
    .in("status", ["pending", "overdue"]);
  const total = (open ?? []).reduce((s, p) => s + Number(p.amount), 0);

  const outcome = await notifyClient(getAdminSupabase(), client, "overdue_reminder", {
    clientName: client.full_name,
    total,
    count: open?.length ?? 0,
  }, { payment_id: payment.id });

  if (outcome.status !== "failed") {
    await guard.supabase.from("payments").update({ last_reminder_at: new Date().toISOString() }).eq("client_id", payment.client_id).in("status", ["pending", "overdue"]);
  }
  return NextResponse.json(outcome, { status: outcome.status === "failed" ? 502 : 200 });
}
