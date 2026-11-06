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
