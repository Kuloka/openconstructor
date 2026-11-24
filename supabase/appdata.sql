-- App data: records that published mini-apps save with oc.db (guestbooks, leaderboards, polls, orders).
-- Run AFTER manage.sql (needs public.pages with hidden/paused). Safe to run more than once.
--   • visitors never touch the table: only db_add() / db_list() below, called by worker.js (/api/db/<slug>)
--   • public records: any visitor can read them; private records ({ private: true }): only the page author
--   • limits: 7 KB per record, 2000 new records per page a day, 50 000 per page in total

create table if not exists public.app_rows (
  id         bigint generated always as identity primary key,
  slug       text not null references public.pages (slug) on delete cascade on update cascade,
  col        text not null,
  data       jsonb not null,
  private    boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.app_rows drop constraint if exists app_rows_col;
alter table public.app_rows add constraint app_rows_col check (col ~ '^[a-z0-9_-]{1,40}$');
alter table public.app_rows drop constraint if exists app_rows_shape;
alter table public.app_rows add constraint app_rows_shape check (jsonb_typeof(data) = 'object' and pg_column_size(data) < 8000);
create index if not exists app_rows_list_idx on public.app_rows (slug, col, created_at desc);

alter table public.app_rows enable row level security;
drop policy if exists "page owners read app data" on public.app_rows;
create policy "page owners read app data" on public.app_rows
  for select to authenticated using (exists (select 1 from public.pages p where p.slug = app_rows.slug and p.owner = auth.uid()));
drop policy if exists "page owners delete app data" on public.app_rows;
create policy "page owners delete app data" on public.app_rows
  for delete to authenticated using (exists (select 1 from public.pages p where p.slug = app_rows.slug and p.owner = auth.uid()));

revoke all on public.app_rows from anon, authenticated;
grant select, delete on public.app_rows to authenticated;

-- add one record (the page must be live)
create or replace function public.db_add(p_slug text, p_col text, p_data jsonb, p_private boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r public.app_rows;
begin
  if not exists (select 1 from public.pages where slug = p_slug and not hidden and not paused) then
    raise exception 'page not found' using errcode = 'P0002';
  end if;
  if (select count(*) from public.app_rows where slug = p_slug and created_at > now() - interval '1 day') >= 2000 then
    raise exception 'too many records today' using errcode = 'P0001';
  end if;
  if (select count(*) from public.app_rows where slug = p_slug) >= 50000 then
    raise exception 'too many records' using errcode = 'P0001';
  end if;
  insert into public.app_rows (slug, col, data, private) values (p_slug, p_col, p_data, coalesce(p_private, false)) returning * into r;
  return jsonb_build_object('id', r.id, 'data', case when r.private then '{}'::jsonb else r.data end, 'created_at', r.created_at);
end $$;
revoke all on function public.db_add(text, text, jsonb, boolean) from public;
grant execute on function public.db_add(text, text, jsonb, boolean) to anon, authenticated;

-- the newest public records of one collection (private ones never come back)
create or replace function public.db_list(p_slug text, p_col text, p_limit int default 50)
returns setof jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('id', a.id, 'data', a.data, 'created_at', a.created_at)
  from public.app_rows a join public.pages p on p.slug = a.slug
  where a.slug = p_slug and a.col = p_col and not a.private and not p.hidden and not p.paused
  order by a.created_at desc
  limit least(greatest(coalesce(p_limit, 50), 1), 200);
$$;
revoke all on function public.db_list(text, text, int) from public;
grant execute on function public.db_list(text, text, int) to anon, authenticated;
