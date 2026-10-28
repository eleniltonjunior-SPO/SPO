import { AppHeader } from "@/components/ui/AppHeader";
import { BottomNav } from "@/components/ui/BottomNav";
import { requireRole } from "@/lib/auth";
import { getServerSupabase } from "@/lib/supabase/server";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireRole("admin");
  const supabase = await getServerSupabase();
  const { count } = await supabase.from("receipts").select("id", { count: "exact", head: true }).eq("status", "submitted");

  return (
    <>
      <AppHeader subtitle={`Admin · ${user.full_name ?? user.email}`} />
      <main className="mx-auto max-w-lg px-4 pt-4 pb-28">{children}</main>
      <BottomNav
        items={[
          { href: "/admin", label: "Route", icon: "calendar" },
          { href: "/admin/payments", label: "Payments", icon: "wallet", badge: count ?? 0 },
          { href: "/admin/reports", label: "Reports", icon: "chart" },
          { href: "/admin/settings", label: "Settings", icon: "settings" },
        ]}
      />
    </>
  );
}
