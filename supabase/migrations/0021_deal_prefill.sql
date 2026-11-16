-- Deal entry that fills itself in: the split each agent is on under their
-- signed rider, for the new-deal form. Safe to run more than once.

alter table public.automation add column if not exists prefill_splits boolean not null default true;

-- Each agent's current rider split, as an individual and (if they are on a team) as a team member.
create or replace function public.rider_splits(ws uuid)
returns table (agent_id uuid, individual_pct numeric, team_pct numeric)
language sql stable security definer set search_path = '' as $$
  select a.id, private.current_rider_pct(a.id, 'individual'), private.current_rider_pct(a.id, 'team')
    from public.agents a
   where a.workspace_id = ws and a.status <> 'exited' and private.has_cap(ws, 'deals.edit');
$$;
revoke all on function public.rider_splits(uuid) from public, anon;
grant execute on function public.rider_splits(uuid) to authenticated;

-- The automation settings gain the "fill in splits" choice.
drop function if exists public.set_automation(uuid, jsonb, boolean, boolean, boolean, text);
create or replace function public.set_automation(ws uuid, tiers jsonb, pack_on_invite boolean, rider_on_invite boolean, rider_on_tier boolean, team_mode text, prefill boolean default true)
returns void language plpgsql security definer set search_path = '' as $$
declare t jsonb; last_to numeric := 0; n integer := 0;
begin
  if not private.has_cap(ws, 'settings.manage') then raise exception 'You are not allowed to change these settings.' using errcode = '42501'; end if;
  if team_mode not in ('lead', 'members') then raise exception 'Choose who signs a team rider.'; end if;
  if jsonb_typeof(tiers) <> 'array' or jsonb_array_length(tiers) > 12 then raise exception 'Use up to 12 tiers.'; end if;
  for t in select * from jsonb_array_elements(tiers) loop
    n := n + 1;
    if (t->>'pct')::numeric < 0 or (t->>'pct')::numeric > 100 then raise exception 'Each tier needs a split from 0 to 100.'; end if;
    if (t->>'from')::numeric <> last_to then raise exception 'Each tier must start where the one before it ends.'; end if;
    if t->>'to' is null then
      if n <> jsonb_array_length(tiers) then raise exception 'Only the last tier can be open-ended.'; end if;
    else
      if (t->>'to')::numeric <= (t->>'from')::numeric then raise exception 'Each tier must end above where it starts.'; end if;
      last_to := (t->>'to')::numeric;
    end if;
  end loop;
  insert into public.automation (workspace_id, default_tiers, send_pack_on_invite, send_rider_on_invite, send_rider_on_tier, team_rider_mode, prefill_splits)
  values (ws, tiers, pack_on_invite, rider_on_invite, rider_on_tier, team_mode, coalesce(prefill, true))
  on conflict (workspace_id) do update set default_tiers = excluded.default_tiers, send_pack_on_invite = excluded.send_pack_on_invite,
    send_rider_on_invite = excluded.send_rider_on_invite, send_rider_on_tier = excluded.send_rider_on_tier,
    team_rider_mode = excluded.team_rider_mode, prefill_splits = excluded.prefill_splits, updated_at = now();
end;
$$;
revoke all on function public.set_automation(uuid, jsonb, boolean, boolean, boolean, text, boolean) from public, anon;
grant execute on function public.set_automation(uuid, jsonb, boolean, boolean, boolean, text, boolean) to authenticated;
