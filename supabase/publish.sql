-- openconstructor: "publish in one click" storage.
-- Public pages served by worker.js at https://openconstructor.pw/p/<slug>.
-- Idempotent: safe to run more than once (Supabase dashboard -> SQL editor).

create table if not exists public.pages (
  slug       text primary key,
  owner      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title      text,
  html       text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Constraints (added separately so re-running on an existing table works)
alter table public.pages drop constraint if exists pages_slug_format;
alter table public.pages add constraint pages_slug_format check (slug ~ '^[a-z0-9][a-z0-9-]{2,47}$');
alter table public.pages drop constraint if exists pages_html_size;
alter table public.pages add constraint pages_html_size check (length(html) <= 1000000);
alter table public.pages drop constraint if exists pages_title_size;
alter table public.pages add constraint pages_title_size check (title is null or length(title) <= 200);

create index if not exists pages_owner_idx on public.pages (owner, updated_at desc);

-- Row level security
alter table public.pages enable row level security;

drop policy if exists "pages are public" on public.pages;
create policy "pages are public" on public.pages
  for select to anon, authenticated using (true);

drop policy if exists "owners insert pages" on public.pages;
create policy "owners insert pages" on public.pages
  for insert to authenticated with check (owner = auth.uid());

drop policy if exists "owners update pages" on public.pages;
create policy "owners update pages" on public.pages
  for update to authenticated using (owner = auth.uid()) with check (owner = auth.uid());

drop policy if exists "owners delete pages" on public.pages;
create policy "owners delete pages" on public.pages
  for delete to authenticated using (owner = auth.uid());

-- Privileges: anonymous visitors may read the page content but not who owns it.
revoke all on public.pages from anon;
grant select (slug, title, html, created_at, updated_at) on public.pages to anon;
grant select, insert, update, delete on public.pages to authenticated;

-- Keep updated_at fresh and created_at / owner immutable
create or replace function public.pages_touch()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  if tg_op = 'UPDATE' then
    new.created_at := old.created_at;
    new.owner := old.owner;
  else
    new.created_at := now();
  end if;
  return new;
end $$;

drop trigger if exists pages_touch on public.pages;
create trigger pages_touch before insert or update on public.pages
  for each row execute function public.pages_touch();

-- Per-user cap: at most 50 published pages
create or replace function public.pages_limit()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  -- an upsert of an existing slug becomes an update, so it doesn't count
  if exists (select 1 from public.pages where slug = new.slug) then
    return new;
  end if;
  perform pg_advisory_xact_lock(hashtext('pages_limit:' || new.owner::text));
  if (select count(*) from public.pages where owner = new.owner) >= 50 then
    raise exception 'page limit reached: unpublish a page to publish a new one (max 50)'
      using errcode = 'P0001';
  end if;
  return new;
end $$;

drop trigger if exists pages_limit on public.pages;
create trigger pages_limit before insert on public.pages
  for each row execute function public.pages_limit();
