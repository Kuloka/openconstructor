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
