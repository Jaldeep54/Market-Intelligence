-- ---------------------------------------------------------------------------
-- push_subscriptions: one row per browser/device Web Push subscription.
-- `endpoint` is unique per subscription (the browser's push service URL) --
-- upserting on it is how the same device re-subscribing (e.g. after
-- changing its language preference) updates its existing row instead of
-- creating a duplicate. Sending notifications reads every row across every
-- user via the service-role client (src/lib/supabase/admin.ts), bypassing
-- RLS entirely, so no admin-select policy is needed here.
-- ---------------------------------------------------------------------------
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth_key text not null,
  lang text not null default 'en' check (lang in ('en', 'gu')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists push_subscriptions_user_id_idx on public.push_subscriptions (user_id);

create trigger push_subscriptions_set_updated_at
  before update on public.push_subscriptions
  for each row execute function public.set_updated_at();

alter table public.push_subscriptions enable row level security;

-- A viewer can only ever see/manage their own subscriptions. Every write
-- goes through a server action that derives user_id from the authenticated
-- session (never trusts a client-supplied id) -- this policy is
-- defense-in-depth, not the only thing stopping a forged user_id.
create policy "push_subscriptions_own_rows"
  on public.push_subscriptions for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
