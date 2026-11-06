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
-- openconstructor · cloud projects
-- Safe to run more than once (idempotent). Run in the Supabase SQL editor.

create extension if not exists pgcrypto;

create table if not exists public.projects (
  id          uuid primary key default gen_random_uuid(),
  owner       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name        text not null,
  data        jsonb not null,
  thumbnail   text null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Element count, kept by Postgres so the project list doesn't need to download `data`
alter table public.projects
  add column if not exists item_count integer
  generated always as (case when jsonb_typeof(data -> 'items') = 'array' then jsonb_array_length(data -> 'items') else 0 end) stored;

-- Constraints (drop + add so re-running updates them)
alter table public.projects drop constraint if exists projects_data_size;
alter table public.projects add constraint projects_data_size check (pg_column_size(data) < 2000000);
alter table public.projects drop constraint if exists projects_data_object;
alter table public.projects add constraint projects_data_object check (jsonb_typeof(data) = 'object');
alter table public.projects drop constraint if exists projects_name_len;
alter table public.projects add constraint projects_name_len check (char_length(name) between 1 and 120);
alter table public.projects drop constraint if exists projects_thumbnail_size;
alter table public.projects add constraint projects_thumbnail_size check (thumbnail is null or char_length(thumbnail) < 300000);

create index if not exists projects_owner_updated_idx on public.projects (owner, updated_at desc);

-- Row level security: every user sees and changes only their own projects
alter table public.projects enable row level security;

drop policy if exists "projects: owner can select" on public.projects;
create policy "projects: owner can select" on public.projects
  for select to authenticated using (owner = auth.uid());

drop policy if exists "projects: owner can insert" on public.projects;
create policy "projects: owner can insert" on public.projects
  for insert to authenticated with check (owner = auth.uid());

drop policy if exists "projects: owner can update" on public.projects;
create policy "projects: owner can update" on public.projects
  for update to authenticated using (owner = auth.uid()) with check (owner = auth.uid());

drop policy if exists "projects: owner can delete" on public.projects;
create policy "projects: owner can delete" on public.projects
  for delete to authenticated using (owner = auth.uid());

-- updated_at bookkeeping (created_at and owner can't be rewritten by clients)
create or replace function public.projects_touch()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  if tg_op = 'UPDATE' then
    new.created_at := old.created_at;
    new.owner := old.owner;
  end if;
  return new;
end $$;

drop trigger if exists projects_touch on public.projects;
create trigger projects_touch before insert or update on public.projects
  for each row execute function public.projects_touch();

-- At most 100 projects per user
create or replace function public.projects_cap()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  -- serialize concurrent inserts of the same user so the cap can't be raced
  perform pg_advisory_xact_lock(hashtextextended(new.owner::text, 0));
  if (select count(*) from public.projects where owner = new.owner) >= 100 then
    raise exception 'project limit reached (100 per account)' using errcode = 'P0001';
  end if;
  return new;
end $$;

drop trigger if exists projects_cap on public.projects;
create trigger projects_cap before insert on public.projects
  for each row execute function public.projects_cap();

revoke all on function public.projects_cap() from public, anon, authenticated;
revoke all on function public.projects_touch() from public, anon, authenticated;

grant select, insert, update, delete on public.projects to authenticated;
revoke all on public.projects from anon;
