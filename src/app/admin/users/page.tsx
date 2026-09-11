import { createClient } from "@/lib/supabase/server";
import { RegisteredUsersList } from "@/components/admin/RegisteredUsersList";

export default async function AdminUsersPage() {
  const supabase = await createClient();
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id,email,role,status,created_at")
    .order("created_at", { ascending: true });

  return <RegisteredUsersList profiles={profiles ?? []} />;
}
