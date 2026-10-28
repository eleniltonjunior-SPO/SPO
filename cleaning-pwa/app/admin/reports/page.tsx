import { subMonths } from "date-fns";
import { FinancialReport } from "@/components/admin/FinancialReport";
import { getServerSupabase } from "@/lib/supabase/server";
import type { LedgerRow } from "@/lib/types";

export const metadata = { title: "Reports" };

export default async function ReportsPage() {
  const supabase = await getServerSupabase();
  // Last 12 months of work, plus any older balance still open.
  const since = subMonths(new Date(), 12).toISOString();
  const { data } = await supabase
    .from("v_job_ledger")
    .select("*")
    .or(`scheduled_start.gte.${since},payment_status.in.(pending,overdue)`)
    .order("scheduled_start");

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Earnings</h1>
      <FinancialReport rows={(data ?? []) as LedgerRow[]} />
    </div>
  );
}
