-- Per-source "exclude URL patterns": lets an admin stop specific URLs/path
-- fragments from a source (e.g. a jobs page picked up by its RSS feed) from
-- ever being pulled into the News Inbox. Purely additive; no existing
-- columns change and no RLS policy changes are needed since this column is
-- covered by the existing news_sources policies.
alter table public.news_sources
  add column if not exists exclude_url_patterns text[] not null default '{}';
