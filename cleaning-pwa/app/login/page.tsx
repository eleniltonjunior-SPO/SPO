"use client";

import { Mail, Sparkles } from "lucide-react";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { getBrowserSupabase } from "@/lib/supabase/client";

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState("sending");
    const next = params.get("next") ?? "/";
    const { error } = await getBrowserSupabase().auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${location.origin}/auth/callback?next=${encodeURIComponent(next)}`, shouldCreateUser: true },
    });
    if (error) {
      setError(error.message);
      setState("error");
    } else setState("sent");
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-6">
      <div className="mb-8 text-center">
        <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl bg-brand-600 text-white">
          <Sparkles className="size-7" />
        </div>
        <h1 className="text-2xl font-bold">Welcome back</h1>
        <p className="text-sm text-slate-500">Sign in with the email on file — we&apos;ll send you a secure link.</p>
      </div>

      {state === "sent" ? (
        <p className="card text-center text-sm">
          Check <strong>{email}</strong> for your sign-in link.
        </p>
      ) : (
        <form onSubmit={submit} className="space-y-3">
          <label className="block">
            <span className="mb-1 block text-sm font-medium">Email</span>
            <input className="input" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <button className="btn-primary w-full" disabled={state === "sending"}>
            <Mail className="size-4" /> {state === "sending" ? "Sending…" : "Send magic link"}
          </button>
          {state === "error" && <p className="text-sm text-rose-600">{error}</p>}
        </form>
      )}
    </main>
  );
}
