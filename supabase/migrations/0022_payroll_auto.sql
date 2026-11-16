-- Payroll that assembles itself: the next run opens on the brokerage's own
-- pay days and the cutoff runs once its time has passed. Releasing a payroll
-- is never automatic. Safe to run more than once.

alter table public.automation add column if not exists auto_open_payroll boolean not null default false;   -- on the pay days set in Settings
alter table public.automation add column if not exists auto_cutoff boolean not null default true;

drop function if exists public.set_automation(uuid, jsonb, boolean, boolean, boolean, text, boolean);
drop function if exists public.set_automation(uuid, jsonb, boolean, boolean, boolean, text, boolean, boolean, boolean);
CREATE OR REPLACE FUNCTION public.set_automation(ws uuid, tiers jsonb, pack_on_invite boolean, rider_on_invite boolean, rider_on_tier boolean, team_mode text, prefill boolean DEFAULT true, open_by_itself boolean DEFAULT false, cutoff_by_itself boolean DEFAULT true)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  insert into public.automation (workspace_id, default_tiers, send_pack_on_invite, send_rider_on_invite, send_rider_on_tier, team_rider_mode, prefill_splits, auto_open_payroll, auto_cutoff)
  values (ws, tiers, pack_on_invite, rider_on_invite, rider_on_tier, team_mode, coalesce(prefill, true), coalesce(open_by_itself, false), coalesce(cutoff_by_itself, true))
  on conflict (workspace_id) do update set default_tiers = excluded.default_tiers, send_pack_on_invite = excluded.send_pack_on_invite,
    send_rider_on_invite = excluded.send_rider_on_invite, send_rider_on_tier = excluded.send_rider_on_tier,
    team_rider_mode = excluded.team_rider_mode, prefill_splits = excluded.prefill_splits, auto_open_payroll = excluded.auto_open_payroll, auto_cutoff = excluded.auto_cutoff, updated_at = now();
end;
$function$;
revoke all on function public.set_automation(uuid, jsonb, boolean, boolean, boolean, text, boolean, boolean, boolean) from public, anon;
grant execute on function public.set_automation(uuid, jsonb, boolean, boolean, boolean, text, boolean, boolean, boolean) to authenticated;
