-- openconstructor: everything after schema.sql in one go (gallery + remix + free AI quota).
-- Safe to run more than once.

-- ═══ gallery.sql ═══
-- Community gallery for published pages. Safe to run more than once.
-- Run AFTER publish.sql (supabase/schema.sql already contains it).

-- 1. Opt-in flag set by the author, and a moderation flag only the site owner can set
alter table public.pages add column if not exists listed boolean not null default false;
alter table public.pages add column if not exists hidden boolean not null default false;

-- 2. One name = one page is already guaranteed by the primary key on slug.
--    Additionally reserve names that belong to the site itself.
alter table public.pages drop constraint if exists pages_slug_not_reserved;
alter table public.pages add constraint pages_slug_not_reserved check (slug not in (
  'gallery','admin','api','app','auth','login','signup','settings','help','about','docs','blog','pricing',
  'terms','privacy','support','openconstructor','official','staff','team','www','mail','root','null','undefined'
)) not valid;

-- 3. Visitors may read the gallery flags; authors may set `listed` but never `hidden` or `owner`
grant select (listed, hidden) on public.pages to anon;
revoke insert, update on public.pages from authenticated;
grant insert (slug, title, html, listed) on public.pages to authenticated;
grant update (title, html, listed) on public.pages to authenticated;

-- 4. Fast gallery listing
create index if not exists pages_gallery_idx on public.pages (updated_at desc) where listed and not hidden;

-- Moderation: to remove a page from the gallery and from /p/<slug>, run
--   update public.pages set hidden = true where slug = '<slug>';

-- ═══ remix.sql ═══
-- Remix: published pages also store their editable project, so anyone can open a
-- gallery page in the editor (/?remix=<slug>) and build on it. Safe to run more than once.
-- Run AFTER publish.sql and gallery.sql.

-- 1. The editable project ({ items, page, name }) and a credit to the page it was remixed from
alter table public.pages add column if not exists source jsonb;
alter table public.pages add column if not exists remixed_from text;

alter table public.pages drop constraint if exists pages_source_size;
alter table public.pages add constraint pages_source_size check (source is null or pg_column_size(source) < 1500000);
alter table public.pages drop constraint if exists pages_source_shape;
alter table public.pages add constraint pages_source_shape check (source is null or jsonb_typeof(source) = 'object');
alter table public.pages drop constraint if exists pages_remixed_from_format;
alter table public.pages add constraint pages_remixed_from_format check (remixed_from is null or remixed_from ~ '^[a-z0-9][a-z0-9-]{2,47}$');

-- 2. Visitors may read the project and the credit (only listed, non-hidden pages are offered for remix by the app)
grant select (source, remixed_from) on public.pages to anon;

-- 3. Authors write `source` on publish/update; `remixed_from` is set once, on insert
revoke insert, update on public.pages from authenticated;
grant insert (slug, title, html, listed, source, remixed_from) on public.pages to authenticated;
grant update (title, html, listed, source) on public.pages to authenticated;

-- ═══ ai.sql ═══
-- openconstructor: free AI without a key (signed-in users, N generations per day).
-- worker.js POST /api/ai calls public.consume_ai_quota() with the user's own JWT,
-- which both validates the session and counts usage, then forwards to Groq.
-- Idempotent: safe to run more than once (Supabase dashboard -> SQL editor).

create table if not exists public.ai_usage (
  owner uuid not null default auth.uid() references auth.users (id) on delete cascade,
  day   date not null default current_date,
  count int  not null default 0,
  primary key (owner, day)
);

create index if not exists ai_usage_day_idx on public.ai_usage (day);

-- Row level security: owners may read their own counters; nobody writes directly.
alter table public.ai_usage enable row level security;

drop policy if exists "owners read ai usage" on public.ai_usage;
create policy "owners read ai usage" on public.ai_usage
  for select to authenticated using (owner = auth.uid());

revoke all on table public.ai_usage from anon, authenticated;
grant select on table public.ai_usage to authenticated;

-- Atomically count one generation for the calling user.
-- Returns {ok, used, limit[, reason]}; reason is 'auth' | 'user' | 'global' when ok = false.
-- Limits are clamped to hard ceilings so a user calling this RPC directly with huge
-- limits cannot burn the shared global budget. Raise the ceilings here if you raise
-- the limits in worker.js.
create or replace function public.consume_ai_quota(daily_limit int default 20, global_limit int default 900)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  max_daily  constant int := 20;
  max_global constant int := 900;
  uid   uuid := auth.uid();
  used  int;
  total int;
begin
  daily_limit  := least(greatest(coalesce(daily_limit, max_daily), 0), max_daily);
  global_limit := least(greatest(coalesce(global_limit, max_global), 0), max_global);

  if uid is null then
    return jsonb_build_object('ok', false, 'reason', 'auth', 'used', 0, 'limit', daily_limit);
  end if;

  -- serialize quota checks so the global sum cannot be overshot by concurrent calls
  perform pg_advisory_xact_lock(hashtext('openconstructor.ai_usage'));

  select coalesce(u.count, 0) into used from public.ai_usage u where u.owner = uid and u.day = current_date;
  used := coalesce(used, 0);
  if used >= daily_limit then
    return jsonb_build_object('ok', false, 'reason', 'user', 'used', used, 'limit', daily_limit);
  end if;

  select coalesce(sum(u.count), 0) into total from public.ai_usage u where u.day = current_date;
  if total >= global_limit then
    return jsonb_build_object('ok', false, 'reason', 'global', 'used', used, 'limit', daily_limit);
  end if;

  insert into public.ai_usage as u (owner, day, count) values (uid, current_date, 1)
  on conflict (owner, day) do update set count = u.count + 1
  returning u.count into used;

  return jsonb_build_object('ok', true, 'used', used, 'limit', daily_limit);
end;
$$;

revoke all on function public.consume_ai_quota(int, int) from public;
revoke all on function public.consume_ai_quota(int, int) from anon;
grant execute on function public.consume_ai_quota(int, int) to authenticated;
