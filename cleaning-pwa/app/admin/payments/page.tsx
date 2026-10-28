import { ReceiptReviewList, type ReceiptForReview } from "@/components/admin/ReceiptReviewList";
import { ReceivablesList, type ReceivableRow } from "@/components/admin/ReceivablesList";
import { RECEIPT_BUCKET } from "@/lib/config";
import { getServerSupabase } from "@/lib/supabase/server";

export const metadata = { title: "Payments" };

type Joined<T> = T | T[] | null;
const one = <T,>(v: Joined<T>): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);

export default async function PaymentsPage() {
  const supabase = await getServerSupabase();

  const [{ data: receipts }, { data: payments }] = await Promise.all([
    supabase
      .from("receipts")
      .select("id, file_name, mime_type, storage_path, created_at, client:clients(full_name), payment:payments(amount, appointment:appointments(scheduled_start))")
      .eq("status", "submitted")
      .order("created_at"),
    supabase
      .from("payments")
      .select("id, amount, status, due_date, paid_at, method, manual_override, client:clients(full_name), appointment:appointments(scheduled_start)")
      .order("due_date", { ascending: false })
      .limit(300),
  ]);

  // Private bucket → short-lived signed URLs for preview.
  const paths = (receipts ?? []).map((r) => r.storage_path);
  const { data: signed } = paths.length
    ? await supabase.storage.from(RECEIPT_BUCKET).createSignedUrls(paths, 60 * 10)
    : { data: [] };
  const urlByPath = new Map((signed ?? []).map((s) => [s.path, s.signedUrl]));

  const queue: ReceiptForReview[] = (receipts ?? []).map((r) => {
    const payment = one(r.payment as Joined<{ amount: number; appointment: Joined<{ scheduled_start: string }> }>);
    return {
      id: r.id,
      file_name: r.file_name,
      mime_type: r.mime_type,
      created_at: r.created_at,
      signedUrl: urlByPath.get(r.storage_path) ?? null,
      clientName: one(r.client as Joined<{ full_name: string }>)?.full_name ?? "Client",
      amount: Number(payment?.amount ?? 0),
      serviceDate: one(payment?.appointment ?? null)?.scheduled_start ?? null,
    };
  });

  const rows: ReceivableRow[] = (payments ?? []).map((p) => ({
    id: p.id,
    amount: Number(p.amount),
    status: p.status,
    due_date: p.due_date,
    paid_at: p.paid_at,
    method: p.method,
    manual_override: p.manual_override,
    clientName: one(p.client as Joined<{ full_name: string }>)?.full_name ?? "Client",
    serviceDate: one(p.appointment as Joined<{ scheduled_start: string }>)?.scheduled_start ?? null,
  }));

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <h1 className="text-xl font-bold">
          Receipts to review {queue.length > 0 && <span className="text-rose-600">({queue.length})</span>}
        </h1>
        <ReceiptReviewList receipts={queue} />
      </section>
      <section className="space-y-3">
        <h2 className="text-xl font-bold">Accounts receivable</h2>
        <ReceivablesList payments={rows} />
      </section>
    </div>
  );
}
