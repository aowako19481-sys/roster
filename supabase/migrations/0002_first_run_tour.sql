-- Kinu: remember, per account, that a person has seen the first-run tour.
-- TEST project only. Safe to run more than once.
--
-- Security model:
--   * Row-level security is enabled and forced.
--   * A signed-in user can read only their own row.
--   * Nobody can write to the table through the API. The only way to change
--     it is the function below, which can do exactly one thing: stamp the
--     CALLER's own row with the server's current time. The browser cannot
--     choose whose row, or what value.

create table if not exists public.user_prefs (
  user_id       uuid primary key references auth.users (id) on delete cascade,
  tour_seen_at  timestamptz
);

alter table public.user_prefs enable row level security;
alter table public.user_prefs force row level security;

revoke all on table public.user_prefs from anon, authenticated;
grant select on table public.user_prefs to authenticated;

drop policy if exists "users read their own preferences" on public.user_prefs;
create policy "users read their own preferences" on public.user_prefs
  for select to authenticated
  using (user_id = (select auth.uid()));

create or replace function public.mark_tour_seen()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
begin
  if me is null then
    raise exception 'not signed in' using errcode = '28000';
  end if;

  insert into public.user_prefs (user_id, tour_seen_at)
  values (me, now())
  on conflict (user_id) do update set tour_seen_at = now();
end;
$$;

revoke all on function public.mark_tour_seen() from public, anon;
grant execute on function public.mark_tour_seen() to authenticated;
