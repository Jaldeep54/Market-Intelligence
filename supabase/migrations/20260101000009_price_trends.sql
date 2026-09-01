-- Price Trends: Solar PV market price database.
-- Normalized (never week-as-columns): one product + one week = one historical
-- price record in weekly_prices, referencing an immutable price_weeks row for
-- that week's date + exchange rates. Wafer/Cell rows additionally snapshot
-- the India Landing Price import inputs used at save time, so a later change
-- to import assumptions for a new week never retroactively changes any
-- earlier week's calculated landing price (see weekly_prices comment below).

-- ---------------------------------------------------------------------------
-- price_categories: Polysilicon / Wafer / Cell / Module / Glass.
-- has_landing_price marks the two categories (Wafer, Cell) that additionally
-- carry an India Landing Price (INR) alongside the China FOB price.
-- ---------------------------------------------------------------------------
create table if not exists public.price_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  slug text not null unique,
  unit text not null,
  has_landing_price boolean not null default false,
  display_order integer not null default 0,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- price_products: the named products within each category (e.g. "n-type
-- 210mm 130um" under Wafer). Reference data managed by admins, not viewers.
-- ---------------------------------------------------------------------------
create table if not exists public.price_products (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.price_categories (id) on delete cascade,
  name text not null,
  slug text not null,
  display_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (category_id, slug)
);

create trigger price_products_set_updated_at
  before update on public.price_products
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- price_weeks: one row per (year, week_number) -- the Thursday price_date
-- plus that week's RMB->USD and RMB->INR exchange rates. week_number is
-- deliberately NOT a primary key (it repeats every year); the natural key is
-- (year, week_number), and price_date is what's actually displayed. Nothing
-- here is ever recalculated with "today's" rate -- every historical
-- china_fob_usd/inr value in weekly_prices was computed from *this* row's
-- rates at the time it was saved.
-- ---------------------------------------------------------------------------
create table if not exists public.price_weeks (
  id uuid primary key default gen_random_uuid(),
  year integer not null,
  week_number integer not null check (week_number > 0),
  price_date date not null,
  rmb_to_usd numeric(12, 6) not null check (rmb_to_usd > 0),
  rmb_to_inr numeric(12, 6) not null check (rmb_to_inr > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (year, week_number)
);

create trigger price_weeks_set_updated_at
  before update on public.price_weeks
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- weekly_prices: the historical price record. One row per product per week.
--
-- china_fob_usd / china_fob_inr are computed once at save time (base_price_rmb
-- times that week's price_weeks rates) and stored -- not recomputed later --
-- so they can never drift even if this row is read alongside a different
-- week's rates by mistake.
--
-- landing_* columns are a SNAPSHOT of the India Landing Price import inputs
-- (Freight / Insurance% / Duty% / Port-CHA / Inland) as they stood when this
-- specific week's row was saved, for Wafer/Cell products only (null
-- otherwise). This is the mechanism that guarantees immutability: editing the
-- import inputs shown on the "Add Weekly Price" form only ever affects rows
-- saved *after* that edit -- every previously-saved week keeps its own
-- snapshot forever, even if the admin changes freight/duty/etc. next week.
-- india_landing_inr is the resulting calculated value, also stored (not a
-- generated column) for the same "never silently recompute" reason, and
-- because it must always display in INR regardless of the viewer's selected
-- currency.
-- ---------------------------------------------------------------------------
create table if not exists public.weekly_prices (
  id uuid primary key default gen_random_uuid(),
  week_id uuid not null references public.price_weeks (id) on delete cascade,
  product_id uuid not null references public.price_products (id) on delete cascade,
  base_price_rmb numeric(14, 4) not null check (base_price_rmb >= 0),
  china_fob_usd numeric(14, 4) not null check (china_fob_usd >= 0),
  china_fob_inr numeric(14, 4) not null check (china_fob_inr >= 0),
  landing_freight numeric(14, 6),
  landing_insurance_pct numeric(9, 6),
  landing_duty_pct numeric(9, 6),
  landing_port_cha numeric(14, 6),
  landing_inland numeric(14, 6),
  india_landing_inr numeric(14, 4),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (week_id, product_id)
);

create trigger weekly_prices_set_updated_at
  before update on public.weekly_prices
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------
create index if not exists price_products_category_id_idx on public.price_products (category_id);
create index if not exists price_weeks_price_date_idx on public.price_weeks (price_date);
create index if not exists weekly_prices_product_id_idx on public.weekly_prices (product_id);
create index if not exists weekly_prices_week_id_idx on public.weekly_prices (week_id);

-- ---------------------------------------------------------------------------
-- RLS: readable by any authenticated user (viewer or admin), writable by
-- admins only -- same pattern as companies / company_capacities etc.
-- ---------------------------------------------------------------------------
alter table public.price_categories enable row level security;

create policy "price_categories_select_authenticated"
  on public.price_categories for select
  to authenticated
  using (true);

create policy "price_categories_write_admin"
  on public.price_categories for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

alter table public.price_products enable row level security;

create policy "price_products_select_authenticated"
  on public.price_products for select
  to authenticated
  using (true);

create policy "price_products_write_admin"
  on public.price_products for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

alter table public.price_weeks enable row level security;

create policy "price_weeks_select_authenticated"
  on public.price_weeks for select
  to authenticated
  using (true);

create policy "price_weeks_write_admin"
  on public.price_weeks for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

alter table public.weekly_prices enable row level security;

create policy "weekly_prices_select_authenticated"
  on public.weekly_prices for select
  to authenticated
  using (true);

create policy "weekly_prices_write_admin"
  on public.weekly_prices for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());
