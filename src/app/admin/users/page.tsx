import { createClient } from "@/lib/supabase/server";

export default async function AdminUsersPage() {
  const supabase = await createClient();
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id,email,role,created_at")
    .order("created_at", { ascending: true });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-semibold text-foreground">Users</h1>
        <p className="mt-1 text-sm text-muted">
          Roles are managed directly in Supabase for security. See docs/SETUP.md for
          instructions.
        </p>
      </div>

      <div className="overflow-hidden rounded-xl border border-border">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-border bg-surface text-left text-xs uppercase tracking-wide text-muted">
              <th className="px-4 py-3 font-medium">Email</th>
              <th className="px-4 py-3 font-medium">Role</th>
            </tr>
          </thead>
          <tbody>
            {(profiles ?? []).map((p) => (
              <tr key={p.id} className="border-b border-border last:border-b-0">
                <td className="px-4 py-3 text-foreground">{p.email}</td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                      p.role === "admin" ? "bg-accent/10 text-accent" : "bg-border/60 text-muted"
                    }`}
                  >
                    {p.role}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
