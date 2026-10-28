"use client";

import { BadgeCheck, BellRing } from "lucide-react";
import { useMemo, useState } from "react";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useApi } from "@/hooks/useApi";
import { formatDate, formatMoney } from "@/lib/time";
import type { PaymentStatus } from "@/lib/types";

export interface ReceivableRow {
  id: string;
  amount: number;
  status: PaymentStatus;
  due_date: string;
  paid_at: string | null;
  method: string | null;
  manual_override: boolean;
  clientName: string;
  serviceDate: string | null;
}

const TABS: { key: PaymentStatus | "open"; label: string }[] = [
  { key: "open", label: "Open" },
  { key: "overdue", label: "Overdue" },
  { key: "pending", label: "Pending" },
  { key: "paid", label: "Paid" },
];

export function ReceivablesList({ payments }: { payments: ReceivableRow[] }) {
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("open");
  const rows = useMemo(
    () => payments.filter((p) => (tab === "open" ? p.status !== "paid" : p.status === tab)),
    [payments, tab],
  );
  const total = rows.reduce((s, p) => s + p.amount, 0);

  return (
    <section className="space-y-3">
      <div className="flex rounded-xl bg-slate-100 p-1" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={`flex-1 rounded-lg py-2 text-sm font-medium ${tab === t.key ? "bg-white shadow-sm" : "text-slate-500"}`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <p className="text-sm text-slate-500">
        {rows.length} item{rows.length === 1 ? "" : "s"} · <span className="font-semibold text-slate-900">{formatMoney(total)}</span>
      </p>
      <ul className="space-y-2">
        {rows.map((p) => (
          <PaymentRow key={p.id} payment={p} />
        ))}
        {!rows.length && <li className="card text-center text-sm text-slate-500">Nothing here.</li>}
      </ul>
    </section>
  );
}

function PaymentRow({ payment: p }: { payment: ReceivableRow }) {
  const { post, busy, error } = useApi();
  const [method, setMethod] = useState("cash");
  const [open, setOpen] = useState(false);

  async function remind() {
    const res = await post<{ status: string; link?: string }>(`/api/payments/${p.id}/remind`);
    if (res?.link) window.open(res.link, "_blank", "noopener");
  }

  return (
    <li className="card space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-semibold">{p.clientName}</p>
          <p className="text-xs text-slate-500">
            {p.serviceDate ? `Cleaning ${formatDate(p.serviceDate)} · ` : ""}
            {p.status === "paid" && p.paid_at
              ? `Paid ${formatDate(p.paid_at)}${p.method ? ` (${p.method})` : ""}`
              : `Due ${formatDate(`${p.due_date}T12:00:00Z`)}`}
          </p>
        </div>
        <div className="text-right">
          <p className="font-semibold tabular-nums">{formatMoney(p.amount)}</p>
          <StatusBadge status={p.status} />
        </div>
      </div>

      {p.status !== "paid" && (
        <>
          {open ? (
            <div className="flex gap-2">
              <select className="input" value={method} onChange={(e) => setMethod(e.target.value)} aria-label="Payment method">
                {["cash", "zelle", "venmo", "check", "card", "other"].map((m) => (
                  <option key={m}>{m}</option>
                ))}
              </select>
              <button className="btn-primary" disabled={busy} onClick={() => post(`/api/payments/${p.id}/mark-paid`, { method })}>
                Confirm
              </button>
            </div>
          ) : (
            <div className="flex gap-2">
              <button className="btn-secondary flex-1" onClick={() => setOpen(true)}>
                <BadgeCheck className="size-4" /> Mark paid
              </button>
              {p.status === "overdue" && (
                <button className="btn-secondary flex-1" disabled={busy} onClick={remind}>
                  <BellRing className="size-4" /> Remind
                </button>
              )}
            </div>
          )}
          {error && <p className="text-sm text-rose-600">{error}</p>}
        </>
      )}
    </li>
  );
}
