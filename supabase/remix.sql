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
