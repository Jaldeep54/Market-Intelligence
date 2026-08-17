// Scheduled news-source check, invoked every 2 hours by Supabase pg_cron
// (via pg_net) -- see supabase/migrations/20260101000007_supabase_cron_dispatch.sql.
// Never publishes anything: it only writes to news_sources / scraped_articles
// / news_candidates / automation_runs, exactly like "Fetch All Active
// Sources" in the Admin UI. Gemini is never called from here (spec: Gemini
// only runs when the admin clicks "Prepare with Gemini" in the app).
//
// Auth: this function keeps Supabase's default JWT verification ON (no
// `--no-verify-jwt`, no custom header check in this file). The cron job
// authenticates by sending the project's service_role key as the
// Authorization Bearer token -- Supabase's own platform gateway verifies
// that JWT before this code ever runs. The service_role key is pulled from
// Supabase Vault by the cron job's SQL, never hard-coded anywhere.
//
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY below are provided
// automatically by the Supabase Edge Function runtime for every function in
// this project -- nothing to configure for those two specifically.
import { createClient } from "npm:@supabase/supabase-js@2";
import { fetchAllActiveSources } from "../_shared/automation/fetchSources.ts";

Deno.serve(async (_req: Request) => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    return new Response(
      JSON.stringify({ ok: false, error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in the function environment." }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  try {
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const summary = await fetchAllActiveSources(supabase, "scheduled");

    return new Response(JSON.stringify({ ok: true, summary }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error while checking sources.";
    return new Response(JSON.stringify({ ok: false, error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
