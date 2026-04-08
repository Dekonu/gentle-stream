import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/auth/admin";
import { AdminRssFeedsPanel } from "@/components/admin/AdminRssFeedsPanel";

export const dynamic = "force-dynamic";

export default async function AdminFeedsPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/admin/feeds");
  if (!isAdmin({ userId: user.id, email: user.email ?? null })) redirect("/");
  return <AdminRssFeedsPanel />;
}

