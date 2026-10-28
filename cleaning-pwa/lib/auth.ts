import "server-only";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { getServerSupabase } from "./supabase/server";
import type { AppUser, Client, UserRole } from "./types";

export async function getCurrentUser(): Promise<AppUser | null> {
  const supabase = await getServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from("users").select("id, role, full_name, email, phone").eq("id", user.id).single();
  return (data as AppUser) ?? null;
}

/** Page guard for Server Components / layouts. */
export async function requireRole(role: UserRole): Promise<AppUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== role) redirect(user.role === "admin" ? "/admin" : "/portal");
  return user;
}

export async function getCurrentClient(): Promise<Client | null> {
  const supabase = await getServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from("clients").select("*").eq("user_id", user.id).maybeSingle();
  return (data as Client) ?? null;
}

type ApiGuard =
  | { ok: true; user: AppUser; supabase: Awaited<ReturnType<typeof getServerSupabase>> }
  | { ok: false; response: NextResponse };

/** Route-handler guard. Returns a 401/403 response instead of redirecting. */
export async function guardApi(role?: UserRole): Promise<ApiGuard> {
  const supabase = await getServerSupabase();
  const user = await getCurrentUser();
  if (!user) return { ok: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  if (role && user.role !== role) return { ok: false, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  return { ok: true, user, supabase };
}

/** Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`. */
export function isCronRequest(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  return !!secret && req.headers.get("authorization") === `Bearer ${secret}`;
}
