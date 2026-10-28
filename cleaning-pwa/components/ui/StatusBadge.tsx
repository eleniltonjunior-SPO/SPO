import { AlertTriangle, CheckCircle2, Clock, PlayCircle, XCircle, CalendarClock, FileClock } from "lucide-react";
import type { AppointmentStatus, PaymentStatus, ReceiptStatus } from "@/lib/types";

type Status = PaymentStatus | AppointmentStatus | ReceiptStatus;

const STYLES: Record<Status, { label: string; className: string; Icon: typeof Clock }> = {
  paid: { label: "Paid", className: "bg-emerald-50 text-emerald-700 ring-emerald-200", Icon: CheckCircle2 },
  pending: { label: "Pending", className: "bg-amber-50 text-amber-800 ring-amber-200", Icon: Clock },
  overdue: { label: "Overdue", className: "bg-rose-50 text-rose-700 ring-rose-200", Icon: AlertTriangle },
  scheduled: { label: "Scheduled", className: "bg-slate-100 text-slate-700 ring-slate-200", Icon: CalendarClock },
  in_progress: { label: "In progress", className: "bg-sky-50 text-sky-700 ring-sky-200", Icon: PlayCircle },
  completed: { label: "Completed", className: "bg-emerald-50 text-emerald-700 ring-emerald-200", Icon: CheckCircle2 },
  cancelled: { label: "Cancelled", className: "bg-slate-100 text-slate-500 ring-slate-200", Icon: XCircle },
  submitted: { label: "Under review", className: "bg-amber-50 text-amber-800 ring-amber-200", Icon: FileClock },
  approved: { label: "Approved", className: "bg-emerald-50 text-emerald-700 ring-emerald-200", Icon: CheckCircle2 },
  rejected: { label: "Rejected", className: "bg-rose-50 text-rose-700 ring-rose-200", Icon: XCircle },
};

export function StatusBadge({ status }: { status: Status }) {
  const { label, className, Icon } = STYLES[status];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${className}`}>
      <Icon className="size-3.5" aria-hidden />
      {label}
    </span>
  );
}
