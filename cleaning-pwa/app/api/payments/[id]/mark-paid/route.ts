import { NextResponse } from "next/server";
import { guardApi } from "@/lib/auth";
import { dbError } from "@/lib/http";

/** POST { method?: string, note?: string } — manual override (cash, Zelle, ...). */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await guardApi("admin");
  if (!guard.ok) return guard.response;

  const { id } = await params;
  const { method, note } = (await req.json().catch(() => ({}))) as { method?: string; note?: string };

  const { data, error } = await guard.supabase.rpc("mark_payment_paid", {
    p_payment_id: id,
    p_method: method?.trim() || "manual",
    p_note: note?.trim() || null,
  });
  if (error) return dbError(error);
  return NextResponse.json({ payment: data });
}
