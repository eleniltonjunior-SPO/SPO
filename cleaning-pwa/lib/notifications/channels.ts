import "server-only";
import type { NotifyChannel } from "../types";
import { toWaNumber, whatsappLink } from "./whatsapp";

export type SendOutcome =
  | { status: "sent" }
  | { status: "link_generated"; link: string }
  | { status: "failed"; error: string };

export const channelConfigured: Record<NotifyChannel, () => boolean> = {
  email: () => !!process.env.RESEND_API_KEY,
  sms: () => !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM),
  whatsapp: () => !!(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID),
};

async function sendEmail(to: string, subject: string, text: string): Promise<SendOutcome> {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: process.env.RESEND_FROM, to, subject, text }),
  });
  return res.ok ? { status: "sent" } : { status: "failed", error: `Resend ${res.status}: ${await res.text()}` };
}

async function sendSms(to: string, text: string): Promise<SendOutcome> {
  const sid = process.env.TWILIO_ACCOUNT_SID!;
  const auth = Buffer.from(`${sid}:${process.env.TWILIO_AUTH_TOKEN}`).toString("base64");
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: "POST",
    headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ To: to, From: process.env.TWILIO_FROM!, Body: text }),
  });
  return res.ok ? { status: "sent" } : { status: "failed", error: `Twilio ${res.status}: ${await res.text()}` };
}

/**
 * WhatsApp Cloud API text message. Note: outside the 24h customer-service
 * window Meta requires a pre-approved template; swap `type: "text"` for
 * `type: "template"` once your templates are approved.
 */
async function sendWhatsApp(to: string, text: string): Promise<SendOutcome> {
  const res = await fetch(`https://graph.facebook.com/v21.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", to: toWaNumber(to), type: "text", text: { body: text } }),
  });
  return res.ok ? { status: "sent" } : { status: "failed", error: `WhatsApp ${res.status}: ${await res.text()}` };
}

export async function send(channel: NotifyChannel, to: string, subject: string, text: string): Promise<SendOutcome> {
  try {
    switch (channel) {
      case "email":
        return await sendEmail(to, subject, text);
      case "sms":
        return await sendSms(to, text);
      case "whatsapp":
        return channelConfigured.whatsapp()
          ? await sendWhatsApp(to, text)
          : { status: "link_generated", link: whatsappLink(to, text) };
    }
  } catch (e) {
    return { status: "failed", error: e instanceof Error ? e.message : String(e) };
  }
}
