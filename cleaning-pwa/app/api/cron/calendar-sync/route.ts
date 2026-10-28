import { NextResponse } from "next/server";
import { isCronRequest } from "@/lib/auth";
import { syncCalendar } from "@/lib/google-calendar";
import { getAdminSupabase } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!isCronRequest(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    return NextResponse.json(await syncCalendar(getAdminSupabase()));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Sync failed" }, { status: 502 });
  }
}
