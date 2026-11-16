-- Licence checks against the state's own published record, where a state
-- publishes one (New York and Texas to start). Kinu keeps only what it needs:
-- the name, type, status and expiry on the state record, where it came from
-- and when. Safe to run more than once.

alter table public.agents add column if not exists licence_record jsonb;
alter table public.agents add column if not exists licence_record_at timestamptz;
alter table public.automation add column if not exists auto_confirm_licence boolean not null default true;

create or replace function public.set_licence_auto(ws uuid, confirm_by_itself boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not private.has_cap(ws, 'settings.manage') then raise exception 'You are not allowed to change these settings.' using errcode = '42501'; end if;
  insert into public.automation (workspace_id, auto_confirm_licence) values (ws, confirm_by_itself)
  on conflict (workspace_id) do update set auto_confirm_licence = excluded.auto_confirm_licence, updated_at = now();
end;
$$;

-- Records what our server read from a state's published record.
--   verified: found, in good standing, not expired, and the name matches.
--   matched:  the same, but this brokerage wants a person to confirm.
--   review:   something does not match, or the record was not found. A person decides.
--   same:     nothing has changed since the last look.
create or replace function public.system_licence_result(agent uuid, verdict text, record jsonb, note text, source text)
returns void language plpgsql security definer set search_path = '' as $$
declare a record;
begin
  if not private.is_system() then raise exception 'not allowed' using errcode = '42501'; end if;
  if verdict not in ('verified', 'matched', 'review', 'same') then raise exception 'unknown verdict'; end if;
  select id, workspace_id, licence_status into a from public.agents where id = agent;
  if not found then return; end if;
  perform set_config('kinu.trusted', 'on', true);
  if verdict = 'same' then   -- the state says what it said last time: only note that we looked
    update public.agents set licence_record_at = now() where id = agent;
    perform set_config('kinu.trusted', 'off', true);
    return;
  end if;
  update public.agents set
    licence_record = record, licence_record_at = now(),
    licence_status = case verdict when 'verified' then 'verified' when 'review' then 'mismatch' else 'submitted' end,
    licence_note = case verdict when 'verified' then null when 'review' then left(coalesce(note, 'Does not match the state record'), 400)
                                else 'The state record matches. Waiting for a person to confirm.' end,
    licence_expires_on = case when verdict = 'verified' and (record ->> 'expires') ~ '^\d{4}-\d{2}-\d{2}$' then (record ->> 'expires')::date else licence_expires_on end,
    licence_checked_at = case when verdict in ('verified', 'review') then now() else licence_checked_at end,
    licence_checked_by = case when verdict in ('verified', 'review') then 'Kinu, from the state record' else licence_checked_by end,
    licence_source = case when verdict in ('verified', 'review') then left(source, 200) else licence_source end
  where id = agent;
  perform private.refresh_onboarding(agent);
  perform set_config('kinu.trusted', 'off', true);
  perform private.log(a.workspace_id, case verdict when 'verified' then 'verified' when 'review' then 'mismatch' else 'matched' end, 'licence', agent::text,
    case verdict when 'verified' then 'Licence confirmed from the state record' when 'review' then 'State record check: ' || coalesce(note, 'needs a person')
                 else 'State record matches; waiting for a person to confirm' end);
end;
$$;

revoke all on function public.system_licence_result(uuid, text, jsonb, text, text) from public, anon, authenticated;
grant execute on function public.system_licence_result(uuid, text, jsonb, text, text) to service_role;
revoke all on function public.set_licence_auto(uuid, boolean) from public, anon;
grant execute on function public.set_licence_auto(uuid, boolean) to authenticated;
