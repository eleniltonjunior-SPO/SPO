"use client";

import { RefreshCw } from "lucide-react";
import { useState } from "react";
import { useApi } from "@/hooks/useApi";

interface SyncResult {
  fetched: number;
  upserted: number;
  cancelled: number;
  unmatchedClients: string[];
}

export function CalendarSyncButton({ compact = false }: { compact?: boolean }) {
  const { post, busy, error } = useApi();
  const [result, setResult] = useState<SyncResult | null>(null);

  return (
    <div className="space-y-2">
      <button className={compact ? "btn-secondary" : "btn-primary w-full"} disabled={busy} onClick={async () => setResult(await post<SyncResult>("/api/calendar/sync"))}>
        <RefreshCw className={`size-4 ${busy ? "animate-spin" : ""}`} />
        {compact ? "Sync" : "Sync Google Calendar now"}
      </button>
      {error && <p className="text-sm text-rose-600">{error}</p>}
      {result && !compact && (
        <p className="text-sm text-slate-600">
          {result.upserted} events synced · {result.cancelled} cancelled
          {result.unmatchedClients.length > 0 && (
            <span className="block text-amber-700">Unmatched: {result.unmatchedClients.slice(0, 5).join(", ")}</span>
          )}
        </p>
      )}
    </div>
  );
}
