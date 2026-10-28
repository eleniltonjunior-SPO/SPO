"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { getServerSupabase } from "@/lib/supabase/server";

export async function saveRegion(formData: FormData) {
  await requireRole("admin");
  const supabase = await getServerSupabase();
  const weekday = formData.get("weekday");
  const { error } = await supabase.from("regions").insert({
    name: String(formData.get("name") ?? "").trim(),
    weekday: weekday === "" || weekday === null ? null : Number(weekday),
    calendar_tag: String(formData.get("calendar_tag") ?? "").trim() || null,
    color: String(formData.get("color") ?? "#0d9488"),
  });
  if (error) throw new Error(error.message);
  revalidatePath("/admin", "layout");
}

export async function toggleRegion(id: string, isActive: boolean) {
  await requireRole("admin");
  const supabase = await getServerSupabase();
  await supabase.from("regions").update({ is_active: isActive }).eq("id", id);
  revalidatePath("/admin", "layout");
}

export async function saveNotificationSettings(formData: FormData) {
  await requireRole("admin");
  const supabase = await getServerSupabase();
  const value = {
    reminder_24h: formData.get("reminder_24h") === "on",
    overdue_reminders: formData.get("overdue_reminders") === "on",
    receipt_alerts: formData.get("receipt_alerts") === "on",
    overdue_reminder_every_days: Math.max(1, Number(formData.get("overdue_reminder_every_days") ?? 3)),
  };
  await supabase.from("app_settings").upsert({ key: "notifications", value, updated_at: new Date().toISOString() });
  revalidatePath("/admin/settings");
}
