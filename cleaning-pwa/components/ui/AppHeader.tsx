import { LogOut } from "lucide-react";
import { BUSINESS_NAME } from "@/lib/config";

export function AppHeader({ subtitle }: { subtitle?: string }) {
  return (
    <header className="pt-safe sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-lg items-center justify-between px-4">
        <div>
          <p className="text-base font-bold leading-tight text-slate-900">{BUSINESS_NAME}</p>
          {subtitle && <p className="text-xs text-slate-500">{subtitle}</p>}
        </div>
        <form action="/auth/signout" method="post">
          <button className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="Sign out">
            <LogOut className="size-5" />
          </button>
        </form>
      </div>
    </header>
  );
}
