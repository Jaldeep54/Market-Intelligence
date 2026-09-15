-- ---------------------------------------------------------------------------
-- Gujarati translation for prepared/published news.
--
-- news_candidates gets an editable Gujarati draft (mirrors prepared_title /
-- prepared_description) plus its own last-run timestamp, kept separate from
-- gemini_last_run_at so a translate run doesn't change the "last prepared
-- with Gemini" wording shown for the English content.
--
-- news gets the corresponding published fields so the public viewer can
-- offer a language toggle. Both are nullable: most rows will never have a
-- Gujarati version, and the viewer falls back to English-only in that case.
-- ---------------------------------------------------------------------------

alter table public.news_candidates
  add column if not exists prepared_title_gu text,
  add column if not exists prepared_description_gu text,
  add column if not exists gemini_gu_last_run_at timestamptz;

alter table public.news
  add column if not exists title_gu text,
  add column if not exists description_gu text;
