-- Market Intelligence: schedule the 2-hour news-source check via Supabase
-- pg_cron + pg_net, calling the "fetch-sources" Edge Function
-- (supabase/functions/fetch-sources). Replaces Vercel Cron entirely --
-- Vercel's Hobby plan cannot run a cron job more often than once a day, and
-- this project no longer depends on Vercel for scheduling at all.
--
-- Nothing here publishes news automatically: the Edge Function performs the
-- exact same fetch/dedupe/relevance logic as "Fetch All Active Sources" in
-- the Admin UI, writing only to news_sources / scraped_articles /
-- news_candidates / automation_runs.
--
-- ---------------------------------------------------------------------------
-- IMPORTANT -- run this ONE-TIME command yourself in the SQL Editor BEFORE
-- running the rest of this migration. It stores the bearer token the cron
-- job uses to call the Edge Function, inside Supabase Vault (encrypted at
-- rest, never in a file, never in chat). Use your project's service_role
-- key as the value (Project Settings -> API -> service_role):
--
--   select vault.create_secret(
--     '<paste your service_role key here, run once, then clear this line>',
--     'edge_function_invoke_key',
--     'Bearer token pg_cron uses to call the fetch-sources Edge Function'
--   );
--
-- If you ever rotate the key, update it with:
--   select vault.update_secret(
--     (select id from vault.secrets where name = 'edge_function_invoke_key'),
--     '<new service_role key>'
--   );
-- ---------------------------------------------------------------------------

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

-- Idempotent: safe to re-run. Removes any existing job of this name before
-- recreating it, so re-running this migration never creates a duplicate
-- schedule.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'fetch-news-sources-every-2-hours') then
    perform cron.unschedule('fetch-news-sources-every-2-hours');
  end if;
end $$;

-- REPLACE the project-ref placeholder below with your real Supabase project
-- ref (visible in your project URL: https://<project-ref>.supabase.co)
-- before running this statement.
select cron.schedule(
  'fetch-news-sources-every-2-hours',
  '0 */2 * * *',
  $$
  select net.http_post(
    url := 'https://YOUR-PROJECT-REF.supabase.co/functions/v1/fetch-sources',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'edge_function_invoke_key'
      )
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 55000
  );
  $$
);
