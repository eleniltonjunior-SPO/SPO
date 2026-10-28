import { NextResponse } from "next/server";
import { guardApi } from "@/lib/auth";
import { dbError } from "@/lib/http";
import { notifyClient } from "@/lib/notifications/dispatch";
import { getAdminSupabase } from "@/lib/supabase/admin";
import type { Receipt } from "@/lib/types";

/** POST { approve: boolean, note?: string } — approval settles the payment. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await guardApi("admin");
  if (!guard.ok) return guard.response;

  const { id } = await params;
  const { approve, note } = (await req.json().catch(() => ({}))) as { approve?: boolean; note?: string };
  if (typeof approve !== "boolean") return NextResponse.json({ error: "approve must be boolean" }, { status: 400 });

  const { data, error } = await guard.supabase.rpc("review_receipt", {
    p_receipt_id: id,
    p_approve: approve,
    p_note: note?.trim() || null,
  });
  if (error) return dbError(error);
  const receipt = data as Receipt;

  const admin = getAdminSupabase();
  const [{ data: client }, { data: payment }] = await Promise.all([
    admin.from("clients").select("id, full_name, email, phone, preferred_channel").eq("id", receipt.client_id).single(),
    admin.from("payments").select("amount").eq("id", receipt.payment_id).single(),
  ]);
  let notification = null;
  if (client) {
    notification = await notifyClient(
      admin,
      client,
      approve ? "receipt_approved" : "receipt_rejected",
      { clientName: client.full_name, amount: Number(payment?.amount ?? 0), note },
      { receipt_id: receipt.id, payment_id: receipt.payment_id },
    );
  }

  return NextResponse.json({ receipt, notification });
}
