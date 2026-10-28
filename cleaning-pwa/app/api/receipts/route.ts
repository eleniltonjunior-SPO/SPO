import { NextResponse } from "next/server";
import { guardApi } from "@/lib/auth";
import { RECEIPT_MAX_BYTES, RECEIPT_MIME_TYPES } from "@/lib/config";
import { notifyAdmin, getNotificationSettings } from "@/lib/notifications/dispatch";
import { getAdminSupabase } from "@/lib/supabase/admin";

interface Body {
  paymentId: string;
  storagePath: string;
  fileName: string;
  mimeType: string;
  size: number;
}

/**
 * Register a receipt the client already uploaded to Storage (direct browser
 * upload, path "<client_id>/<payment_id>/<uuid>.<ext>"), then alert the admin.
 * RLS on `receipts` enforces ownership and that the payment is unpaid.
 */
export async function POST(req: Request) {
  const guard = await guardApi("client");
  if (!guard.ok) return guard.response;

  const body = (await req.json().catch(() => null)) as Body | null;
  if (!body?.paymentId || !body.storagePath) return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  if (!(RECEIPT_MIME_TYPES as readonly string[]).includes(body.mimeType))
    return NextResponse.json({ error: "Unsupported file type" }, { status: 415 });
  if (body.size <= 0 || body.size > RECEIPT_MAX_BYTES) return NextResponse.json({ error: "File too large" }, { status: 413 });

  const { data: client } = await guard.supabase.from("clients").select("id, full_name").eq("user_id", guard.user.id).single();
  if (!client) return NextResponse.json({ error: "No client profile" }, { status: 403 });
  if (!body.storagePath.startsWith(`${client.id}/${body.paymentId}/`))
    return NextResponse.json({ error: "Invalid storage path" }, { status: 400 });

  const { data: receipt, error } = await guard.supabase
    .from("receipts")
    .insert({
      payment_id: body.paymentId,
      client_id: client.id,
      storage_path: body.storagePath,
      file_name: body.fileName.slice(0, 200),
      mime_type: body.mimeType,
      size_bytes: body.size,
    })
    .select("id, payment_id")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const admin = getAdminSupabase();
  const settings = await getNotificationSettings(admin);
  if (settings.receipt_alerts) {
    const { data: payment } = await admin.from("payments").select("amount").eq("id", receipt.payment_id).single();
    await notifyAdmin(
      admin,
      "receipt_uploaded_admin",
      { clientName: client.full_name, amount: Number(payment?.amount ?? 0), receiptId: receipt.id },
      { receipt_id: receipt.id, payment_id: receipt.payment_id },
    ).catch((e) => console.error("notifyAdmin failed", e));
  }

  return NextResponse.json({ receipt }, { status: 201 });
}
