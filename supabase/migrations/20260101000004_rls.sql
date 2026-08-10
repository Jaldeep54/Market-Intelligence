-- Market Intelligence: Row Level Security.
-- Enforced in the database so a viewer session can never read/write data it
-- shouldn't, regardless of what the frontend does or doesn't hide.

-- ---------------------------------------------------------------------------
-- Helper: is the current session an admin? SECURITY DEFINER + owned by the
-- migration role (postgres) so it bypasses RLS on profiles internally and
-- avoids infinite recursion when profiles' own policies call it indirectly.
-- ---------------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;

create policy "profiles_select_own_or_admin"
  on public.profiles for select
  to authenticated
  using (id = auth.uid() or public.is_admin());

-- No insert/update/delete policies for authenticated users: rows are created
-- only by the handle_new_user trigger (SECURITY DEFINER) and role changes are
-- made by the project owner directly in the Supabase SQL editor.

-- ---------------------------------------------------------------------------
-- companies (readable by any logged-in user, writable by admin only)
-- ---------------------------------------------------------------------------
alter table public.companies enable row level security;

create policy "companies_select_authenticated"
  on public.companies for select
  to authenticated
  using (true);

create policy "companies_write_admin"
  on public.companies for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- company_capacities
-- ---------------------------------------------------------------------------
alter table public.company_capacities enable row level security;

create policy "company_capacities_select_authenticated"
  on public.company_capacities for select
  to authenticated
  using (true);

create policy "company_capacities_write_admin"
  on public.company_capacities for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- company_management
-- ---------------------------------------------------------------------------
alter table public.company_management enable row level security;

create policy "company_management_select_authenticated"
  on public.company_management for select
  to authenticated
  using (true);

create policy "company_management_write_admin"
  on public.company_management for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- company_financials
-- ---------------------------------------------------------------------------
alter table public.company_financials enable row level security;

create policy "company_financials_select_authenticated"
  on public.company_financials for select
  to authenticated
  using (true);

create policy "company_financials_write_admin"
  on public.company_financials for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- company_technologies
-- ---------------------------------------------------------------------------
alter table public.company_technologies enable row level security;

create policy "company_technologies_select_authenticated"
  on public.company_technologies for select
  to authenticated
  using (true);

create policy "company_technologies_write_admin"
  on public.company_technologies for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- news: viewers see only published rows; admins see + manage everything.
-- ---------------------------------------------------------------------------
alter table public.news enable row level security;

create policy "news_select_published_or_admin"
  on public.news for select
  to authenticated
  using (published = true or public.is_admin());

create policy "news_write_admin"
  on public.news for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- tags / news_tags
-- ---------------------------------------------------------------------------
alter table public.tags enable row level security;

create policy "tags_select_authenticated"
  on public.tags for select
  to authenticated
  using (true);

create policy "tags_write_admin"
  on public.tags for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

alter table public.news_tags enable row level security;

create policy "news_tags_select_authenticated"
  on public.news_tags for select
  to authenticated
  using (true);

create policy "news_tags_write_admin"
  on public.news_tags for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());
