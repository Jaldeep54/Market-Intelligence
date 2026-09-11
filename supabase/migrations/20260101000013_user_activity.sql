-- Market Intelligence: per-user usage counters, so the admin can see how
-- much a registered viewer is actually using the app (news swipes, Price
-- Trends visits, Company Profile visits). Running totals only -- no
-- per-event timestamps/history, by design (see record_activity below).

create table if not exists public.user_activity (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  news_swipes integer not null default 0,
  price_trends_visits integer not null default 0,
  company_profile_visits integer not null default 0,
  updated_at timestamptz not null default now()
);

create trigger user_activity_set_updated_at
  before update on public.user_activity
  for each row execute function public.set_updated_at();

alter table public.user_activity enable row level security;

-- A user can see their own row; only admins can see everyone's (the
-- Admin -> User Activity dashboard).
create policy "user_activity_select_own_or_admin"
  on public.user_activity for select
  to authenticated
  using (user_id = auth.uid() or public.is_admin());

-- Deliberately no insert/update/delete policy for authenticated users:
-- every write goes through record_activity() below. It's security definer
-- and keyed off auth.uid() *inside* the function (never a caller-supplied
-- id), so a session can only ever increment its own row -- there is no
-- direct table-level write path to increment someone else's counters or
-- set an arbitrary value.
create or replace function public.record_activity(kind text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if kind not in ('news_swipe', 'price_trends_visit', 'company_profile_visit') then
    raise exception 'invalid activity kind: %', kind;
  end if;

  insert into public.user_activity (user_id, news_swipes, price_trends_visits, company_profile_visits)
  values (
    auth.uid(),
    (kind = 'news_swipe')::int,
    (kind = 'price_trends_visit')::int,
    (kind = 'company_profile_visit')::int
  )
  on conflict (user_id) do update set
    news_swipes = public.user_activity.news_swipes + (kind = 'news_swipe')::int,
    price_trends_visits = public.user_activity.price_trends_visits + (kind = 'price_trends_visit')::int,
    company_profile_visits = public.user_activity.company_profile_visits + (kind = 'company_profile_visit')::int;
end;
$$;

grant execute on function public.record_activity(text) to authenticated;
