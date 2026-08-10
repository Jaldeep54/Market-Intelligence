-- Market Intelligence: extensions + shared helper functions
-- Safe to re-run (idempotent where practical).

create extension if not exists "pgcrypto";

-- Generic "touch updated_at" trigger function used by every table below.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
