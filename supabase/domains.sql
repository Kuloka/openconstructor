-- openconstructor: custom domains for published pages (worker.js /api/domain, Cloudflare for SaaS).
-- Run after publish.sql. Idempotent. Writes happen only on the server (service role), after it has
-- checked that the page belongs to the user; everyone can read host -> slug (it's public anyway).
create table if not exists public.domains (
  host       text primary key check (host ~ '^[a-z0-9.-]{4,253}$'),
  slug       text not null references public.pages (slug) on delete cascade on update cascade,
  owner      uuid not null references auth.users (id) on delete cascade,
  cf_id      text,
  created_at timestamptz not null default now()
);
create index if not exists domains_owner_idx on public.domains (owner);
create index if not exists domains_slug_idx on public.domains (slug);

alter table public.domains enable row level security;
drop policy if exists "domains are public" on public.domains;
create policy "domains are public" on public.domains for select to anon, authenticated using (true);
revoke insert, update, delete on public.domains from anon, authenticated;
grant select on public.domains to anon, authenticated;
