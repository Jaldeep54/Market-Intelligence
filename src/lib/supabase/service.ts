import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// Service-role client. Bypasses Row Level Security entirely, so it must
// NEVER be imported into client code or exposed to the browser, and must
// only be used by the scheduled cron route handler (src/app/api/cron/...),
// which runs with no logged-in admin session to satisfy the normal RLS
// admin policies. Every other part of the app continues to use the
// cookie-scoped client in src/lib/supabase/server.ts, which enforces RLS
// as the logged-in user.
export function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "Missing SUPABASE_SERVICE_ROLE_KEY (or NEXT_PUBLIC_SUPABASE_URL). Set it in the server " +
        "environment only -- see .env.example."
    );
  }

  return createSupabaseClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
