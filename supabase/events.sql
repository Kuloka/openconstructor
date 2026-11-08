-- Funnel counters for openconstructor: one row per (day, event) with a count. No personal data.
-- The editor calls public.track_event('<name>') (track.js). Safe to run more than once.
--
-- See the funnel:
--   select day, event, count from public.events where day > current_date - 14 order by day desc, count desc;

create table if not exists public.events (
  day   date not null default current_date,
  event text not null,
  count bigint not null default 0,
  primary key (day, event)
);

alter table public.events enable row level security;
revoke all on table public.events from anon, authenticated;

-- Only known event names, so the table can't be filled with junk
create or replace function public.track_event(e text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if e is null or e not in ('visit', 'editor', 'ai_send', 'ai_ok', 'ai_fail', 'ai_limit', 'signup_prompt', 'signup_click', 'signin',
                            'publish', 'share', 'export', 'gallery', 'remix', 'template') then
    return;
  end if;
  insert into public.events as ev (day, event, count) values (current_date, e, 1)
  on conflict (day, event) do update set count = ev.count + 1;
end $$;

revoke all on function public.track_event(text) from public;
grant execute on function public.track_event(text) to anon, authenticated;
