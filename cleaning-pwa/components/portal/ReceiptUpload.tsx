"use client";

import { CheckCircle2, Loader2, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { RECEIPT_BUCKET, RECEIPT_MAX_BYTES, RECEIPT_MIME_TYPES } from "@/lib/config";
import { getBrowserSupabase } from "@/lib/supabase/client";

type State = { kind: "idle" } | { kind: "uploading" } | { kind: "done" } | { kind: "error"; message: string };

/**
 * Two-step upload: file → Storage (direct, RLS-scoped to "<client_id>/…"),
 * then POST /api/receipts to register it and alert the business owner.
 */
export function ReceiptUpload({ clientId, paymentId }: { clientId: string; paymentId: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [state, setState] = useState<State>({ kind: "idle" });

  async function handle(file: File) {
    if (!(RECEIPT_MIME_TYPES as readonly string[]).includes(file.type))
      return setState({ kind: "error", message: "Use a photo (JPG, PNG, WEBP, HEIC) or a PDF." });
    if (file.size > RECEIPT_MAX_BYTES) return setState({ kind: "error", message: "File must be 10 MB or smaller." });

    setState({ kind: "uploading" });
    const ext = file.name.split(".").pop()?.toLowerCase() || "bin";
    const path = `${clientId}/${paymentId}/${crypto.randomUUID()}.${ext}`;

    const supabase = getBrowserSupabase();
    const { error: upErr } = await supabase.storage.from(RECEIPT_BUCKET).upload(path, file, { contentType: file.type, upsert: false });
    if (upErr) return setState({ kind: "error", message: upErr.message });

    const res = await fetch("/api/receipts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paymentId, storagePath: path, fileName: file.name, mimeType: file.type, size: file.size }),
    });
    if (!res.ok) {
      await supabase.storage.from(RECEIPT_BUCKET).remove([path]);
      const { error } = await res.json().catch(() => ({ error: "Upload failed" }));
      return setState({ kind: "error", message: error });
    }
    setState({ kind: "done" });
    router.refresh();
  }

  if (state.kind === "done")
    return (
      <p className="flex items-center gap-1.5 text-sm font-medium text-emerald-700">
        <CheckCircle2 className="size-4" /> Receipt sent — we&apos;ll confirm shortly.
      </p>
    );

  return (
    <div className="space-y-1">
      <input
        ref={inputRef}
        type="file"
        accept={RECEIPT_MIME_TYPES.join(",")}
        className="sr-only"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handle(f);
          e.target.value = "";
        }}
      />
      <button className="btn-primary w-full" disabled={state.kind === "uploading"} onClick={() => inputRef.current?.click()}>
        {state.kind === "uploading" ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
        {state.kind === "uploading" ? "Uploading…" : "Upload payment receipt"}
      </button>
      {state.kind === "error" && <p className="text-sm text-rose-600" role="alert">{state.message}</p>}
    </div>
  );
}
