import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AdminNav } from "@/components/admin/AdminNav";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  // Middleware already blocks non-admins from /admin; this is a defense-in-depth
  // check in case a page is ever rendered outside the middleware matcher.
  if (profile?.role !== "admin") redirect("/");

  return (
    <div className="flex min-h-screen flex-1 flex-col">
      <AdminNav email={user.email ?? null} />
      <div className="flex flex-1 flex-col px-4 py-6 sm:px-8">{children}</div>
    </div>
  );
}
