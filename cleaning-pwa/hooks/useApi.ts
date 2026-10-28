"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

/** POST JSON to an API route, then refresh Server Components. */
export function useApi() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [, startTransition] = useTransition();

  async function post<T = unknown>(url: string, body?: unknown): Promise<T | null> {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error ?? `Request failed (${res.status})`);
        return null;
      }
      startTransition(() => router.refresh());
      return json as T;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
      return null;
    } finally {
      setBusy(false);
    }
  }

  return { post, busy, error, setError };
}
