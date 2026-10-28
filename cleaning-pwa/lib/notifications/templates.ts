import { BUSINESS_NAME, APP_URL } from "../config";
import { formatDate, formatMoney, formatTime } from "../time";

export type TemplateId =
  | "reminder_24h"
  | "receipt_uploaded_admin"
  | "receipt_approved"
  | "receipt_rejected"
  | "overdue_reminder";

export interface Message {
  subject: string;
  text: string;
}

export const templates = {
  reminder_24h: (p: { clientName: string; start: string; address?: string | null }): Message => ({
    subject: `Reminder: cleaning ${formatDate(p.start)} at ${formatTime(p.start)}`,
    text:
      `Hi ${firstName(p.clientName)}! 👋 Friendly reminder from ${BUSINESS_NAME}: ` +
      `your cleaning is scheduled for ${formatDate(p.start, undefined, "EEEE, MMM d")} at ${formatTime(p.start)}` +
      `${p.address ? ` (${p.address})` : ""}. Reply here if you need to reschedule.`,
  }),

  receipt_uploaded_admin: (p: { clientName: string; amount: number; receiptId: string }): Message => ({
    subject: `New payment receipt from ${p.clientName}`,
    text: `${p.clientName} uploaded a payment receipt for ${formatMoney(p.amount)}. Review: ${APP_URL}/admin/payments#receipt-${p.receiptId}`,
  }),

  receipt_approved: (p: { clientName: string; amount: number }): Message => ({
    subject: "Payment confirmed — thank you!",
    text: `Hi ${firstName(p.clientName)}, your payment of ${formatMoney(p.amount)} has been confirmed. Thank you! — ${BUSINESS_NAME}`,
  }),

  receipt_rejected: (p: { clientName: string; amount: number; note?: string | null }): Message => ({
    subject: "We couldn't confirm your payment receipt",
    text:
      `Hi ${firstName(p.clientName)}, we couldn't confirm the receipt for ${formatMoney(p.amount)}` +
      `${p.note ? `: ${p.note}` : "."} Please upload a new one at ${APP_URL}/portal. — ${BUSINESS_NAME}`,
  }),

  overdue_reminder: (p: { clientName: string; total: number; count: number }): Message => ({
    subject: `Outstanding balance: ${formatMoney(p.total)}`,
    text:
      `Hi ${firstName(p.clientName)}, this is a friendly reminder that you have ${p.count} overdue ` +
      `cleaning payment${p.count > 1 ? "s" : ""} totaling ${formatMoney(p.total)}. ` +
      `You can pay and upload your receipt at ${APP_URL}/portal. Thank you! — ${BUSINESS_NAME}`,
  }),
} satisfies Record<TemplateId, (p: never) => Message>;

function firstName(full: string) {
  return full.split(" ")[0] ?? full;
}
