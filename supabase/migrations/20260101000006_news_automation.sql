-- Market Intelligence: automated news collection, review & Gemini prep pipeline.
-- Purely additive: does not alter, rename, or drop any existing table.
--
-- Pipeline: news_sources (config)
--        -> scraped_articles (raw, immutable discovery record, 1 row per unique article)
--        -> news_candidates (review/workflow state + Gemini-prepared fields, 1:1 with scraped_articles)
--        -> on Approve & Publish, a row is written into the existing public.news table.
--
-- automation_runs logs every source check (scheduled or manual); ai_processing_logs logs every
-- Gemini request. Both are admin-only, for the "Automation" dashboard.

-- ---------------------------------------------------------------------------
-- news_sources: admin-configured monitoring sources. No URLs are seeded here.
-- ---------------------------------------------------------------------------
create table if not exists public.news_sources (
  id uuid primary key default gen_random_uuid(),
  source_name text not null,
  website_url text not null,
  feed_url text,
  source_type text not null default 'rss' check (source_type in ('rss', 'website', 'other')),
  active boolean not null default true,
  default_category text check (
    default_category is null
    or default_category in ('Global Market', 'Indian Market', 'Top Company News', 'Analytical News')
  ),
  priority text not null default 'medium' check (priority in ('high', 'medium', 'low')),
  fetch_interval_minutes integer not null default 120 check (fetch_interval_minutes > 0),
  last_checked_at timestamptz,
  last_success_at timestamptz,
  last_error text,
  articles_found_last_fetch integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger news_sources_set_updated_at
  before update on public.news_sources
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- scraped_articles: raw discovery storage. Never shown on the CTO dashboard.
-- canonical_url is unique so a source re-check never creates a second row for
-- an article already seen (Level 1 exact-duplicate protection at the DB layer).
-- ---------------------------------------------------------------------------
create table if not exists public.scraped_articles (
  id uuid primary key default gen_random_uuid(),
  source_id uuid references public.news_sources (id) on delete set null,
  source_name text not null,
  original_url text not null,
  canonical_url text not null unique,
  original_title text not null,
  original_description text,
  raw_content text,
  published_at timestamptz,
  discovered_at timestamptz not null default now(),
  author text,
  image_url text,
  content_hash text not null,
  fetch_status text not null default 'ok' check (fetch_status in ('ok', 'partial', 'error')),
  fetch_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger scraped_articles_set_updated_at
  before update on public.scraped_articles
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- news_candidates: the admin's review workflow. One row per scraped article
-- that entered the News Inbox. Holds relevance/duplicate signals plus the
-- editable fields Gemini prepares (or the admin fills in by hand).
-- ---------------------------------------------------------------------------
create table if not exists public.news_candidates (
  id uuid primary key default gen_random_uuid(),
  scraped_article_id uuid not null unique references public.scraped_articles (id) on delete cascade,
  source_id uuid references public.news_sources (id) on delete set null,
  status text not null default 'new' check (
    status in ('new', 'needs_review', 'prepared', 'approved', 'published', 'rejected', 'duplicate')
  ),
  relevance_label text not null default 'medium' check (
    relevance_label in ('high', 'medium', 'low', 'needs_review')
  ),
  relevance_score integer not null default 0,
  suggested_category text check (
    suggested_category is null
    or suggested_category in ('Global Market', 'Indian Market', 'Top Company News', 'Analytical News')
  ),
  suggested_company_id uuid references public.companies (id) on delete set null,
  possible_duplicate_of uuid references public.news_candidates (id) on delete set null,
  duplicate_note text,
  -- Gemini-prepared / admin-editable fields (null until prepared or saved).
  prepared_title text,
  prepared_description text,
  prepared_category text check (
    prepared_category is null
    or prepared_category in ('Global Market', 'Indian Market', 'Top Company News', 'Analytical News')
  ),
  prepared_company_id uuid references public.companies (id) on delete set null,
  prepared_news_date date,
  prepared_tags text[] not null default '{}',
  gemini_last_run_at timestamptz,
  gemini_error text,
  published_news_id uuid references public.news (id) on delete set null,
  reviewed_by uuid references auth.users (id) on delete set null,
  reviewed_at timestamptz,
  approved_by uuid references auth.users (id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger news_candidates_set_updated_at
  before update on public.news_candidates
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- automation_runs: one row per source per fetch batch (scheduled or manual).
-- batch_id groups every source checked together in a single "Fetch All" or
-- scheduled run, so the Automation page can show both per-batch summaries
-- and per-source detail from the same table.
-- ---------------------------------------------------------------------------
create table if not exists public.automation_runs (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null default gen_random_uuid(),
  batch_trigger text not null default 'manual_source' check (
    batch_trigger in ('scheduled', 'manual_all', 'manual_source')
  ),
  source_id uuid references public.news_sources (id) on delete set null,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  status text not null default 'running' check (status in ('running', 'success', 'failed')),
  articles_found integer not null default 0,
  new_articles integer not null default 0,
  duplicates integer not null default 0,
  skipped_articles integer not null default 0,
  error_message text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- ai_processing_logs: lightweight Gemini usage tracking (section 34).
-- ---------------------------------------------------------------------------
create table if not exists public.ai_processing_logs (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid references public.news_candidates (id) on delete cascade,
  model text not null,
  status text not null check (status in ('success', 'error')),
  error_message text,
  requested_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------
create index if not exists news_sources_active_idx on public.news_sources (active);

create index if not exists scraped_articles_source_id_idx on public.scraped_articles (source_id);
create index if not exists scraped_articles_content_hash_idx on public.scraped_articles (content_hash);
create index if not exists scraped_articles_discovered_at_idx on public.scraped_articles (discovered_at desc);

create index if not exists news_candidates_status_idx on public.news_candidates (status);
create index if not exists news_candidates_relevance_label_idx on public.news_candidates (relevance_label);
create index if not exists news_candidates_source_id_idx on public.news_candidates (source_id);
create index if not exists news_candidates_created_at_idx on public.news_candidates (created_at desc);
create index if not exists news_candidates_published_news_id_idx on public.news_candidates (published_news_id);

create index if not exists automation_runs_batch_id_idx on public.automation_runs (batch_id);
create index if not exists automation_runs_source_id_idx on public.automation_runs (source_id);
create index if not exists automation_runs_started_at_idx on public.automation_runs (started_at desc);

create index if not exists ai_processing_logs_candidate_id_idx on public.ai_processing_logs (candidate_id);
create index if not exists ai_processing_logs_created_at_idx on public.ai_processing_logs (created_at desc);

-- ---------------------------------------------------------------------------
-- RLS: admin-only on every new table. Viewers get no policy at all, so RLS's
-- default-deny keeps them fully blocked from raw/staging/automation data.
-- The scheduled job runs with the Supabase service-role key (server-only,
-- never sent to the browser), which bypasses RLS entirely by design -- that
-- is the standard, documented way a Vercel Cron job writes as "the system"
-- when no admin is logged in. See docs/SETUP.md.
-- ---------------------------------------------------------------------------
alter table public.news_sources enable row level security;
create policy "news_sources_admin_all"
  on public.news_sources for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

alter table public.scraped_articles enable row level security;
create policy "scraped_articles_admin_all"
  on public.scraped_articles for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

alter table public.news_candidates enable row level security;
create policy "news_candidates_admin_all"
  on public.news_candidates for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

alter table public.automation_runs enable row level security;
create policy "automation_runs_admin_all"
  on public.automation_runs for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

alter table public.ai_processing_logs enable row level security;
create policy "ai_processing_logs_admin_all"
  on public.ai_processing_logs for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());
