-- Market Intelligence: core schema
-- Roles: 'admin' | 'viewer'. Categories: 'Global Market' | 'Indian Market' | 'Top Company News' | 'Analytical News'.

-- ---------------------------------------------------------------------------
-- profiles: one row per authenticated user, holds application role.
-- id is the same as auth.users.id (1:1).
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  role text not null default 'viewer' check (role in ('admin', 'viewer')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- Auto-create a profile (default role: viewer) whenever a new auth user is
-- created. Admin role is granted afterwards by the project owner via a
-- one-line SQL update (see docs/SETUP.md) -- never via client code.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, role)
  values (new.id, new.email, 'viewer')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- companies: the tracked solar companies.
-- ---------------------------------------------------------------------------
create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  slug text not null unique,
  overview text,
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger companies_set_updated_at
  before update on public.companies
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- company_capacities: current + planned manufacturing capacity (1:1 with company).
-- Free-text fields (e.g. "6.5 GW") because units/precision vary by disclosure.
-- ---------------------------------------------------------------------------
create table if not exists public.company_capacities (
  company_id uuid primary key references public.companies (id) on delete cascade,
  module_capacity text,
  planned_module_capacity text,
  cell_capacity text,
  planned_cell_capacity text,
  wafer_capacity text,
  planned_wafer_capacity text,
  updated_at timestamptz not null default now()
);

create trigger company_capacities_set_updated_at
  before update on public.company_capacities
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- company_management: key people (1:1 with company).
-- ---------------------------------------------------------------------------
create table if not exists public.company_management (
  company_id uuid primary key references public.companies (id) on delete cascade,
  owner_promoter text,
  ceo_md text,
  cto text,
  cfo text,
  updated_at timestamptz not null default now()
);

create trigger company_management_set_updated_at
  before update on public.company_management
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- company_financials: many quarterly/annual revenue rows per company.
-- revenue_display is free text so admin can enter "Not publicly disclosed".
-- ---------------------------------------------------------------------------
create table if not exists public.company_financials (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  period_type text not null check (period_type in ('quarter', 'fiscal_year')),
  period_label text not null,
  revenue_display text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger company_financials_set_updated_at
  before update on public.company_financials
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- company_technologies: technology x product x max efficiency rows.
-- ---------------------------------------------------------------------------
create table if not exists public.company_technologies (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  technology text not null check (technology in ('Mono-PERC', 'TOPCon', 'HJT', 'Back Contact', 'Other')),
  product text not null check (product in ('Module', 'Cell', 'Wafer/Ingot')),
  max_efficiency text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger company_technologies_set_updated_at
  before update on public.company_technologies
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- news
-- ---------------------------------------------------------------------------
create table if not exists public.news (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null,
  category text not null check (
    category in ('Global Market', 'Indian Market', 'Top Company News', 'Analytical News')
  ),
  company_id uuid references public.companies (id) on delete set null,
  news_date date not null,
  source_url text not null,
  published boolean not null default false,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger news_set_updated_at
  before update on public.news
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- tags + news_tags (many-to-many)
-- ---------------------------------------------------------------------------
create table if not exists public.tags (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.news_tags (
  news_id uuid not null references public.news (id) on delete cascade,
  tag_id uuid not null references public.tags (id) on delete cascade,
  primary key (news_id, tag_id)
);
