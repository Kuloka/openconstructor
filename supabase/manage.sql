-- Managing published pages: turn a page off without deleting it, count views, collect form
-- submissions. Safe to run more than once. Run AFTER publish.sql, gallery.sql and remix.sql
-- (or after schema.sql + update.sql).

-- 1. Columns: `paused` is set by the author, `views` only by page_view() below
alter table public.pages add column if not exists paused boolean not null default false;
alter table public.pages add column if not exists views bigint not null default 0;

grant select (paused) on public.pages to anon;
revoke insert, update on public.pages from authenticated;
grant insert (slug, title, html, listed, source, remixed_from, paused) on public.pages to authenticated;
grant update (title, html, listed, source, paused) on public.pages to authenticated;

-- 2. updated_at changes only when the page itself changes (not on a view or a visibility switch),
--    so the gallery order and "updated" dates stay meaningful
create or replace function public.pages_touch()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    new.created_at := old.created_at;
    new.owner := old.owner;
    if new.html is distinct from old.html or new.title is distinct from old.title or new.source is distinct from old.source then
      new.updated_at := now();
    else
      new.updated_at := old.updated_at;
    end if;
  else
    new.created_at := now();
    new.updated_at := now();
  end if;
  return new;
end $$;

-- 3. One more view (worker.js calls this for each visit, skipping bots and repeat visits)
create or replace function public.page_view(p_slug text)
returns void language sql security definer set search_path = '' as $$
  update public.pages set views = views + 1 where slug = p_slug and not hidden and not paused;
$$;
revoke all on function public.page_view(text) from public;
grant execute on function public.page_view(text) to anon, authenticated;

-- 4. Form submissions from published pages
create table if not exists public.form_submissions (
  id         bigint generated always as identity primary key,
  slug       text not null references public.pages (slug) on delete cascade on update cascade,
  data       jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.form_submissions drop constraint if exists form_data_size;
alter table public.form_submissions add constraint form_data_size check (pg_column_size(data) < 20000);
alter table public.form_submissions drop constraint if exists form_data_shape;
alter table public.form_submissions add constraint form_data_shape check (jsonb_typeof(data) = 'object');
create index if not exists form_submissions_slug_idx on public.form_submissions (slug, created_at desc);

alter table public.form_submissions enable row level security;
drop policy if exists "page owners read submissions" on public.form_submissions;
create policy "page owners read submissions" on public.form_submissions
  for select to authenticated using (exists (select 1 from public.pages p where p.slug = form_submissions.slug and p.owner = auth.uid()));
drop policy if exists "page owners delete submissions" on public.form_submissions;
create policy "page owners delete submissions" on public.form_submissions
  for delete to authenticated using (exists (select 1 from public.pages p where p.slug = form_submissions.slug and p.owner = auth.uid()));

revoke all on public.form_submissions from anon, authenticated;
grant select, delete on public.form_submissions to authenticated;

-- Visitors add submissions only through this function: the page must be live, and each page
-- takes at most 300 submissions a day (worker.js also limits each visitor)
create or replace function public.submit_form(p_slug text, p_data jsonb)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.pages where slug = p_slug and not hidden and not paused) then
    raise exception 'page not found' using errcode = 'P0002';
  end if;
  if (select count(*) from public.form_submissions where slug = p_slug and created_at > now() - interval '1 day') >= 300 then
    raise exception 'too many submissions today' using errcode = 'P0001';
  end if;
  insert into public.form_submissions (slug, data) values (p_slug, p_data);
end $$;
revoke all on function public.submit_form(text, jsonb) from public;
grant execute on function public.submit_form(text, jsonb) to anon, authenticated;
