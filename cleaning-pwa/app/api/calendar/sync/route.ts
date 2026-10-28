import { NextResponse } from "next/server";
import { guardApi } from "@/lib/auth";
import { syncCalendar } from "@/lib/google-calendar";
import { getAdminSupabase } from "@/lib/supabase/admin";

/** Manual "Sync now" from the admin UI. */
export async function POST() {
  const guard = await guardApi("admin");
  if (!guard.ok) return guard.response;
  try {
    const result = await syncCalendar(getAdminSupabase());
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Sync failed" }, { status: 502 });
  }
}
