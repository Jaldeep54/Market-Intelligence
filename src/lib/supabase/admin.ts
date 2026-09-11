import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// The service-role key bypasses RLS and grants full auth-management
// capability (supabase.auth.admin.*) -- this file must never be imported
// from client code, hence the "server-only" import above (a build-time
// error if it ever is). Only supabase.auth.admin.updateUserById() (setting
// a user's password from the admin panel) uses this -- see
// setUserPasswordAction in src/lib/actions/users.ts, which re-verifies the
// caller is an admin *before* ever calling this.
//
// Deliberately NOT the @supabase/ssr helpers used elsewhere (client.ts /
// server.ts): this client authenticates purely via the service-role key
// itself, with no user session or cookies involved.
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "Missing Supabase admin environment variables. Set SUPABASE_SERVICE_ROLE_KEY " +
        "(see .env.example) -- never NEXT_PUBLIC_, server-only."
    );
  }

  return createSupabaseClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
