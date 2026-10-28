import { NextResponse } from "next/server";
import { isCronRequest } from "@/lib/auth";
import { getNotificationSettings, notifyClient } from "@/lib/notifications/dispatch";
import { getAdminSupabase } from "@/lib/supabase/admin";
import type { Client } from "@/lib/types";

export const dynamic = "force-dynamic";

type ClientRow = Pick<Client, "id" | "full_name" | "email" | "phone" | "preferred_channel" | "reminders_enabled" | "address">;

/**
 * Hourly job:
 *  1. pending → overdue for payments past due date
 *  2. 24h-before cleaning reminders (once per appointment)
 *  3. overdue balance reminders (once every N days per client)
 */
export async function GET(req: Request) {
  if (!isCronRequest(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = getAdminSupabase();
  const settings = await getNotificationSettings(db);
  const now = new Date();
  const summary = { markedOverdue: 0, reminders: 0, overdueReminders: 0, links: [] as string[], failures: 0 };

  const { data: overdueCount } = await db.rpc("mark_overdue_payments");
  summary.markedOverdue = Number(overdueCount ?? 0);

  // --- 24h reminders: start within (now, now + 24h], not yet reminded --------
  if (settings.reminder_24h) {
    const { data: upcoming } = await db
      .from("appointments")
      .select("id, scheduled_start, location, client:clients(id, full_name, email, phone, preferred_channel, reminders_enabled, address)")
      .eq("status", "scheduled")
      .is("reminder_sent_at", null)
      .not("client_id", "is", null)
      .gt("scheduled_start", now.toISOString())
      .lte("scheduled_start", new Date(now.getTime() + 24 * 3_600_000).toISOString());

    for (const appt of upcoming ?? []) {
      const client = appt.client as unknown as ClientRow | null;
      if (!client?.reminders_enabled) continue;

      const outcome = await notifyClient(
        db,
        client,
        "reminder_24h",
        { clientName: client.full_name, start: appt.scheduled_start, address: appt.location ?? client.address },
        { appointment_id: appt.id },
      );
      if (outcome.status === "failed") {
        summary.failures++;
        continue;
      }
      if (outcome.status === "link_generated") summary.links.push(outcome.link);
      summary.reminders++;
      await db.from("appointments").update({ reminder_sent_at: now.toISOString() }).eq("id", appt.id);
    }
  }

  // --- Overdue reminders, grouped per client -----------------------------------
  if (settings.overdue_reminders) {
    const cutoff = new Date(now.getTime() - settings.overdue_reminder_every_days * 86_400_000).toISOString();
    const { data: overdue } = await db
      .from("payments")
      .select("id, amount, client_id, last_reminder_at, client:clients(id, full_name, email, phone, preferred_channel, reminders_enabled, address)")
      .eq("status", "overdue")
      .or(`last_reminder_at.is.null,last_reminder_at.lt.${cutoff}`);

    const byClient = new Map<string, { client: ClientRow; ids: string[]; total: number }>();
    for (const p of overdue ?? []) {
      const client = p.client as unknown as ClientRow | null;
      if (!client?.reminders_enabled) continue;
      const g = byClient.get(client.id) ?? { client, ids: [], total: 0 };
      g.ids.push(p.id);
      g.total += Number(p.amount);
      byClient.set(client.id, g);
    }

    for (const { client, ids, total } of byClient.values()) {
      const outcome = await notifyClient(db, client, "overdue_reminder", {
        clientName: client.full_name,
        total,
        count: ids.length,
      }, { payment_id: ids[0] });
      if (outcome.status === "failed") {
        summary.failures++;
        continue;
      }
      if (outcome.status === "link_generated") summary.links.push(outcome.link);
      summary.overdueReminders++;
      await db.from("payments").update({ last_reminder_at: now.toISOString() }).in("id", ids);
    }
  }

  return NextResponse.json(summary);
}
