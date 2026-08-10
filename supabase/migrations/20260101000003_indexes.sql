-- Market Intelligence: indexes supporting the app's query patterns.

create index if not exists news_category_idx on public.news (category);
create index if not exists news_news_date_idx on public.news (news_date desc);
create index if not exists news_company_id_idx on public.news (company_id);
create index if not exists news_published_idx on public.news (published);
create index if not exists news_published_category_date_idx
  on public.news (published, category, news_date desc);
create index if not exists news_published_company_date_idx
  on public.news (published, company_id, news_date desc);

create index if not exists company_financials_company_id_idx on public.company_financials (company_id);
create index if not exists company_technologies_company_id_idx on public.company_technologies (company_id);
create index if not exists news_tags_tag_id_idx on public.news_tags (tag_id);
create index if not exists companies_slug_idx on public.companies (slug);
