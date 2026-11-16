-- Work Kinu does when nobody is signed in: collecting finished signatures,
-- reminders, licence renewal notices and the weekly summary. It runs from our
-- own server on a timer, with the server's key. Safe to run more than once.

alter table public.automation add column if not exists chase_signatures boolean not null default true;
alter table public.automation add column if not exists nudge_onboarding boolean not null default true;
alter table public.automation add column if not exists licence_reminders boolean not null default true;
alter table public.automation add column if not exists weekly_summary boolean not null default true;

alter table public.sign_requests add column if not exists reminders_sent integer not null default 0;
alter table public.sign_requests add column if not exists last_reminded_at timestamptz;
alter table public.sign_documents add column if not exists reminders_sent integer not null default 0;
alter table public.sign_documents add column if not exists last_reminded_at timestamptz;
alter table public.agents add column if not exists nudges_sent integer not null default 0;
alter table public.agents add column if not exists last_nudged_at timestamptz;
alter table public.agents add column if not exists licence_reminded_days integer;

-- True only for our own server using its secret key. A signed-in person can never be this.
create or replace function private.is_system()
returns boolean language sql stable set search_path = '' as $$
  select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''),
                  nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '') = 'service_role';
$$;

create or replace function public.set_background(ws uuid, chase boolean, nudge boolean, licence boolean, weekly boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not private.has_cap(ws, 'settings.manage') then raise exception 'You are not allowed to change these settings.' using errcode = '42501'; end if;
  insert into public.automation (workspace_id, chase_signatures, nudge_onboarding, licence_reminders, weekly_summary)
  values (ws, chase, nudge, licence, weekly)
  on conflict (workspace_id) do update set chase_signatures = excluded.chase_signatures, nudge_onboarding = excluded.nudge_onboarding,
    licence_reminders = excluded.licence_reminders, weekly_summary = excluded.weekly_summary, updated_at = now();
end;
$$;

-- A fresh onboarding link for a reminder email. Only our server may ask for one.
create or replace function public.system_reissue_invite(agent uuid, token_hash text)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_system() then raise exception 'not allowed' using errcode = '42501'; end if;
  if token_hash !~ '^[0-9a-f]{64}$' then raise exception 'bad token'; end if;
  perform set_config('kinu.trusted', 'on', true);
  update public.agents set invite_token_hash = token_hash, invite_expires_at = now() + interval '14 days',
         nudges_sent = nudges_sent + 1, last_nudged_at = now()
   where id = agent and onboarding_status <> 'ready' and status <> 'exited';
  perform set_config('kinu.trusted', 'off', true);
  return found;
end;
$$;

-- Records that a licence renewal notice went out for this many days before expiry.
create or replace function public.system_licence_reminded(agent uuid, days integer)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_system() then raise exception 'not allowed' using errcode = '42501'; end if;
  perform set_config('kinu.trusted', 'on', true);
  update public.agents set licence_reminded_days = days where id = agent;
  perform set_config('kinu.trusted', 'off', true);
end;
$$;

-- Finished signatures can now also be recorded by our server (after it has
-- read the result back from the signing service itself).
CREATE OR REPLACE FUNCTION public.update_sign_request(ws uuid, request uuid, new_status text, signed_file text, certificate_file text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare s record; r record; names text;
begin
  if not (private.has_cap(ws, 'riders.manage') or private.is_system()) then raise exception 'You are not allowed to update signature requests.' using errcode = '42501'; end if;
  if new_status not in ('sent', 'opened', 'signed', 'declined', 'cancelled') then raise exception 'Unknown status.'; end if;
  select * into s from public.sign_requests where id = request and workspace_id = ws for update;
  if not found then raise exception 'That signature request could not be found.'; end if;
  if s.status in ('signed', 'declined', 'cancelled') then return s.status; end if;   -- finished requests never change
  if signed_file is not null and signed_file not like ws::text || '/riders/%' then raise exception 'That file is not in this brokerage.'; end if;
  if certificate_file is not null and certificate_file not like ws::text || '/riders/%' then raise exception 'That file is not in this brokerage.'; end if;
  if new_status = 'signed' and signed_file is null then raise exception 'The signed document is missing.'; end if;

  update public.sign_requests
     set status = new_status,
         completed_at = case when new_status in ('signed', 'declined', 'cancelled') then now() else null end,
         file_path = case when new_status = 'signed' then signed_file else null end,
         certificate_path = case when new_status = 'signed' then certificate_file else null end
   where id = request;
  if new_status <> 'signed' then return new_status; end if;

  select * into r from public.riders where id = s.rider_id and workspace_id = ws;
  perform set_config('kinu.trusted', 'on', true);
  insert into public.documents (workspace_id, agent_id, kind, filename, path, status, note)
  values (ws, s.agent_id, 'rider', 'Rider v' || r.version || ' - signed.pdf', signed_file, 'on_file', 'Signed electronically by ' || s.signer_name);
  if certificate_file is not null then
    insert into public.documents (workspace_id, agent_id, kind, filename, path, status, note)
    values (ws, s.agent_id, 'rider', 'Rider v' || r.version || ' - signing certificate.pdf', certificate_file, 'on_file', 'Signing certificate');
  end if;

  -- Is everyone who was asked now done?
  if r.status in ('draft', 'sent')
     and not exists (select 1 from public.sign_requests x where x.rider_id = r.id and x.status in ('sent', 'opened'))
     and not exists (select 1 from public.sign_requests x where x.rider_id = r.id and x.status = 'declined'
                       and not exists (select 1 from public.sign_requests y where y.rider_id = r.id and y.agent_id = x.agent_id and y.status = 'signed')) then
    select string_agg(distinct x.signer_name, ', ') into names from public.sign_requests x where x.rider_id = r.id and x.status = 'signed';
    update public.riders set is_current = false, status = 'superseded'
     where is_current and id <> r.id and ((r.agent_id is not null and agent_id = r.agent_id) or (r.team_id is not null and team_id = r.team_id));
    update public.riders set status = 'signed', is_current = true, signed_at = now(), signed_name = left(names, 400), signed_consent = true,
           signature_note = 'Signed electronically' where id = r.id;
    if r.agent_id is not null then
      update public.agents set rider_status = 'signed' where id = r.agent_id;
      update public.deal_agents da set split_pct = da.split_pct
        from public.deals d where d.id = da.deal_id and da.agent_id = r.agent_id and d.status in ('open', 'held', 'cleared');
    end if;
    perform set_config('kinu.trusted', 'off', true);
    return 'rider_signed';
  end if;
  perform set_config('kinu.trusted', 'off', true);
  return 'signed';
end;
$function$;

CREATE OR REPLACE FUNCTION public.update_sign_document(ws uuid, doc uuid, new_status text, signer_states jsonb, signed_file text, certificate_file text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare d record; a uuid; merged jsonb;
begin
  if not (private.can_send_documents(ws) or private.is_system()) then raise exception 'You are not allowed to update documents for signature.' using errcode = '42501'; end if;
  if new_status not in ('sent', 'opened', 'signed', 'declined', 'cancelled') then raise exception 'Unknown status.'; end if;
  select * into d from public.sign_documents where id = doc and workspace_id = ws for update;
  if not found then raise exception 'That document could not be found.'; end if;
  if d.status in ('signed', 'declined', 'cancelled') then return d.status; end if;
  if signed_file is not null and signed_file not like ws::text || '/sign/%' then raise exception 'That file is not in this brokerage.'; end if;
  if certificate_file is not null and certificate_file not like ws::text || '/sign/%' then raise exception 'That file is not in this brokerage.'; end if;
  if new_status = 'signed' and signed_file is null then raise exception 'The signed document is missing.'; end if;
  -- Only each signer's status may change; who they are is fixed when it is sent.
  select jsonb_agg(s.value || jsonb_build_object('status', coalesce(nullif(signer_states->>(s.ordinality - 1)::int, ''), s.value->>'status')) order by s.ordinality)
    into merged from jsonb_array_elements(d.signers) with ordinality s;
  if exists (select 1 from jsonb_array_elements(merged) m where m->>'status' not in ('sent', 'opened', 'signed', 'declined')) then raise exception 'Unknown signer status.'; end if;

  update public.sign_documents
     set status = new_status, signers = merged,
         completed_at = case when new_status in ('signed', 'declined', 'cancelled') then now() else null end,
         file_path = case when new_status = 'signed' then signed_file else null end,
         certificate_path = case when new_status = 'signed' then certificate_file else null end
   where id = doc;
  if new_status = 'signed' then
    perform set_config('kinu.trusted', 'on', true);
    foreach a in array d.agent_ids loop
      insert into public.documents (workspace_id, agent_id, kind, filename, path, status, note)
      values (ws, a, 'agreement', left(d.title, 180) || ' - signed.pdf', signed_file, 'on_file', 'Signed electronically');
      if certificate_file is not null then
        insert into public.documents (workspace_id, agent_id, kind, filename, path, status, note)
        values (ws, a, 'agreement', left(d.title, 160) || ' - signing certificate.pdf', certificate_file, 'on_file', 'Signing certificate');
      end if;
    end loop;
    perform set_config('kinu.trusted', 'off', true);
  end if;
  return new_status;
end;
$function$;

do $$
declare f text;
begin
  foreach f in array array['public.system_reissue_invite(uuid, text)', 'public.system_licence_reminded(uuid, integer)'] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
  foreach f in array array['public.update_sign_request(uuid, uuid, text, text, text)', 'public.update_sign_document(uuid, uuid, text, jsonb, text, text)'] loop
    execute format('grant execute on function %s to service_role', f);
  end loop;
  execute 'revoke all on function public.set_background(uuid, boolean, boolean, boolean, boolean) from public, anon';
  execute 'grant execute on function public.set_background(uuid, boolean, boolean, boolean, boolean) to authenticated';
end $$;
