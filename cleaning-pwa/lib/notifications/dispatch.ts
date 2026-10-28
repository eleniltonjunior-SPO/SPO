import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Client, NotifyChannel } from "../types";
import { channelConfigured, send, type SendOutcome } from "./channels";
import { templates, type Message, type TemplateId } from "./templates";

interface Related {
  appointment_id?: string;
  payment_id?: string;
  receipt_id?: string;
}

type Recipient = Pick<Client, "id" | "full_name" | "email" | "phone" | "preferred_channel">;

/** Preferred channel first, then any configured fallback with a usable address. */
function routeFor(client: Recipient): { channel: NotifyChannel; to: string } | null {
  const address = (c: NotifyChannel) => (c === "email" ? client.email : client.phone);
  const order: NotifyChannel[] = [client.preferred_channel, "email", "sms", "whatsapp"];
  for (const c of order) {
    const to = address(c);
    if (!to) continue;
    // WhatsApp is always "available" (deep-link fallback); others need credentials.
    if (c === "whatsapp" || channelConfigured[c]()) return { channel: c, to };
  }
  return null;
}

async function log(
  db: SupabaseClient,
  entry: { channel: NotifyChannel; to: string; template: TemplateId; msg: Message; outcome: SendOutcome; clientId?: string } & Related,
) {
  await db.from("notification_log").insert({
    channel: entry.channel,
    recipient: entry.to,
    template: entry.template,
    body: entry.msg.text,
    status: entry.outcome.status,
    error: entry.outcome.status === "failed" ? entry.outcome.error : null,
    client_id: entry.clientId ?? null,
    appointment_id: entry.appointment_id ?? null,
    payment_id: entry.payment_id ?? null,
    receipt_id: entry.receipt_id ?? null,
  });
}

export async function notifyClient<T extends TemplateId>(
  db: SupabaseClient,
  client: Recipient,
  template: T,
  params: Parameters<(typeof templates)[T]>[0],
  related: Related = {},
): Promise<SendOutcome & { channel?: NotifyChannel }> {
  const route = routeFor(client);
  if (!route) return { status: "failed", error: "Client has no reachable contact" };
  const msg = (templates[template] as (p: typeof params) => Message)(params);
  const outcome = await send(route.channel, route.to, msg.subject, msg.text);
  await log(db, { ...route, template, msg, outcome, clientId: client.id, ...related });
  return { ...outcome, channel: route.channel };
}

/** Alerts to the business owner: email if configured, else WhatsApp. */
export async function notifyAdmin<T extends TemplateId>(
  db: SupabaseClient,
  template: T,
  params: Parameters<(typeof templates)[T]>[0],
  related: Related = {},
): Promise<SendOutcome> {
  const msg = (templates[template] as (p: typeof params) => Message)(params);
  const route: { channel: NotifyChannel; to: string } | null =
    process.env.ADMIN_EMAIL && channelConfigured.email()
      ? { channel: "email", to: process.env.ADMIN_EMAIL }
      : process.env.ADMIN_WHATSAPP
        ? { channel: "whatsapp", to: process.env.ADMIN_WHATSAPP }
        : null;
  if (!route) return { status: "failed", error: "No admin contact configured" };
  const outcome = await send(route.channel, route.to, msg.subject, msg.text);
  await log(db, { ...route, template, msg, outcome, ...related });
  return outcome;
}

export async function getNotificationSettings(db: SupabaseClient) {
  const { data } = await db.from("app_settings").select("value").eq("key", "notifications").maybeSingle();
  return {
    reminder_24h: true,
    overdue_reminders: true,
    overdue_reminder_every_days: 3,
    receipt_alerts: true,
    ...((data?.value as object) ?? {}),
  } as { reminder_24h: boolean; overdue_reminders: boolean; overdue_reminder_every_days: number; receipt_alerts: boolean };
}
