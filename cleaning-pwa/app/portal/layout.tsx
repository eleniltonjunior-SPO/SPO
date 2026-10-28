import { AppHeader } from "@/components/ui/AppHeader";
import { requireRole } from "@/lib/auth";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const user = await requireRole("client");
  return (
    <>
      <AppHeader subtitle={`Hi, ${user.full_name?.split(" ")[0] ?? "there"}`} />
      <main className="mx-auto max-w-lg space-y-6 px-4 pt-4 pb-12">{children}</main>
    </>
  );
}
