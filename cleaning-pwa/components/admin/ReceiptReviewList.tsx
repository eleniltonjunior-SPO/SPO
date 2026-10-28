"use client";

import { Check, ExternalLink, FileText, X } from "lucide-react";
import { useState } from "react";
import { useApi } from "@/hooks/useApi";
import { formatDate, formatMoney, formatTime } from "@/lib/time";

export interface ReceiptForReview {
  id: string;
  file_name: string;
  mime_type: string;
  created_at: string;
  signedUrl: string | null;
  clientName: string;
  amount: number;
  serviceDate: string | null;
}

/** Admin approval queue for client-uploaded payment proofs. */
export function ReceiptReviewList({ receipts }: { receipts: ReceiptForReview[] }) {
  if (!receipts.length) return <p className="card text-center text-sm text-slate-500">No receipts waiting for review.</p>;
  return (
    <ul className="space-y-3">
      {receipts.map((r) => (
        <ReceiptRow key={r.id} receipt={r} />
      ))}
    </ul>
  );
}

function ReceiptRow({ receipt: r }: { receipt: ReceiptForReview }) {
  const { post, busy, error } = useApi();
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState("");
  const isImage = r.mime_type.startsWith("image/");

  return (
    <li id={`receipt-${r.id}`} className="card space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-semibold">{r.clientName}</p>
          <p className="text-sm text-slate-500">
            {formatMoney(r.amount)}
            {r.serviceDate && ` · cleaning ${formatDate(r.serviceDate)}`}
          </p>
          <p className="text-xs text-slate-400">
            Uploaded {formatDate(r.created_at)} {formatTime(r.created_at)}
          </p>
        </div>
        {r.signedUrl && (
          <a href={r.signedUrl} target="_blank" rel="noreferrer" className="btn-secondary min-h-9 px-3" aria-label="Open receipt">
            <ExternalLink className="size-4" />
          </a>
        )}
      </div>

      {r.signedUrl && isImage ? (
        // eslint-disable-next-line @next/next/no-img-element -- signed, short-lived URL
        <img src={r.signedUrl} alt={`Receipt from ${r.clientName}`} className="max-h-72 w-full rounded-xl border border-slate-200 object-contain" />
      ) : (
        <div className="flex items-center gap-2 rounded-xl bg-slate-50 p-3 text-sm text-slate-600">
          <FileText className="size-5" /> {r.file_name}
        </div>
      )}

      {rejecting && (
        <input className="input" placeholder="Reason (sent to client)" value={note} onChange={(e) => setNote(e.target.value)} autoFocus />
      )}
      {error && <p className="text-sm text-rose-600">{error}</p>}

      <div className="flex gap-2">
        {rejecting ? (
          <>
            <button className="btn-secondary flex-1" onClick={() => setRejecting(false)} disabled={busy}>Cancel</button>
            <button className="btn-danger flex-1" disabled={busy} onClick={() => post(`/api/receipts/${r.id}/review`, { approve: false, note })}>
              <X className="size-4" /> Reject
            </button>
          </>
        ) : (
          <>
            <button className="btn-secondary flex-1" onClick={() => setRejecting(true)} disabled={busy}>
              <X className="size-4" /> Reject
            </button>
            <button className="btn-primary flex-1" disabled={busy} onClick={() => post(`/api/receipts/${r.id}/review`, { approve: true })}>
              <Check className="size-4" /> Approve
            </button>
          </>
        )}
      </div>
    </li>
  );
}
