-- Market Intelligence: admin-approval gate for self-registered accounts.
-- A signup no longer becomes usable on its own (via email confirmation or
-- otherwise) -- it sits as 'pending' until an admin approves it from
-- /admin/users. 'rejected' accounts stay in this state permanently (this is
-- a status flag, not a deletion -- see approveUserAction/rejectUserAction).

alter table public.profiles
  add column status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected'));

-- IMPORTANT: adding a `not null default 'pending'` column backfills every
-- *existing* row (including whatever admin/viewer accounts already exist)
-- to 'pending' the moment the ALTER TABLE runs. Without this immediate
-- follow-up, every current user -- admins included -- would be locked out
-- on deploy. Only rows inserted after this migration (real new signups,
-- via handle_new_user's column default) should ever start 'pending'.
update public.profiles set status = 'approved';

-- Set once an admin approves/rejects a still-pending signup that's been
-- waiting over 24h, by the escalation cron (see
-- src/app/api/cron/check-pending-approvals) -- prevents that one signup
-- from re-triggering the notification email on every subsequent run.
alter table public.profiles add column escalated_at timestamptz;

-- ---------------------------------------------------------------------------
-- is_approved(): mirrors is_admin() exactly (see 20260101000004_rls.sql) --
-- security definer + stable, so it can be used inside other tables' RLS
-- policies without recursing back through profiles' own RLS.
-- ---------------------------------------------------------------------------
create or replace function public.is_approved()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and status = 'approved'
  );
$$;

-- ---------------------------------------------------------------------------
-- Harden RLS, not just middleware: every policy below previously read
-- `using (true)` for any authenticated session, which means a pending or
-- rejected user's session could already read this data directly against
-- Supabase, regardless of what the Next.js app's middleware does. Admins
-- always pass regardless of their own status (role is a deliberate,
-- manually-granted trust decision -- see profiles_select_own_or_admin).
-- profiles_select_own_or_admin itself is untouched: a pending/rejected user
-- still needs to read their own row to know their own status.
-- ---------------------------------------------------------------------------
alter policy "companies_select_authenticated" on public.companies
  using (public.is_admin() or public.is_approved());

alter policy "company_capacities_select_authenticated" on public.company_capacities
  using (public.is_admin() or public.is_approved());

alter policy "company_management_select_authenticated" on public.company_management
  using (public.is_admin() or public.is_approved());

alter policy "company_financials_select_authenticated" on public.company_financials
  using (public.is_admin() or public.is_approved());

alter policy "company_technologies_select_authenticated" on public.company_technologies
  using (public.is_admin() or public.is_approved());

alter policy "news_select_published_or_admin" on public.news
  using (public.is_admin() or (published = true and public.is_approved()));

alter policy "tags_select_authenticated" on public.tags
  using (public.is_admin() or public.is_approved());

alter policy "news_tags_select_authenticated" on public.news_tags
  using (public.is_admin() or public.is_approved());

alter policy "price_categories_select_authenticated" on public.price_categories
  using (public.is_admin() or public.is_approved());

alter policy "price_products_select_authenticated" on public.price_products
  using (public.is_admin() or public.is_approved());

alter policy "price_weeks_select_authenticated" on public.price_weeks
  using (public.is_admin() or public.is_approved());

alter policy "weekly_prices_select_authenticated" on public.weekly_prices
  using (public.is_admin() or public.is_approved());
