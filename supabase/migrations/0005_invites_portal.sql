-- Kinu: inviting agents, and the agent onboarding portal.
-- Safe to run more than once.
--
-- An invited agent has no login. They reach their own onboarding through a
-- private link. Only a hash of the link's token is stored. The portal
-- functions below can be called ONLY by the server (service role), never by
-- a browser, and each one works on exactly the agent the token belongs to.

alter table public.agents drop constraint if exists agents_licence_status_check;
alter table public.agents add constraint agents_licence_status_check
  check (licence_status in ('verified', 'mismatch', 'expiring', 'not_uploaded', 'submitted'));

alter table public.agents
  add column if not exists licence_number text,          -- as typed by the agent; shown masked
  add column if not exists licence_state  text;

-- ------------------------------------------------------------- inviting --

create or replace function private.note_invite(ws uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare batch uuid;
begin
  -- Invites sent within the same hour count as one batch.
  select b.id into batch from public.onboarding_batches b
   where b.workspace_id = ws and b.sent_at > now() - interval '1 hour' order by b.sent_at desc limit 1;
  if batch is null then
    insert into public.onboarding_batches (workspace_id, sent_at, sent_count, ready_count) values (ws, now(), 1, 0);
  else
    update public.onboarding_batches set sent_count = sent_count + 1 where id = batch;
  end if;
end;
$$;

-- Create an agent and their invitation in one step. The split becomes a
-- rider waiting for the agent's signature.
create or replace function public.invite_agent(
  ws uuid, agent_name text, agent_email text, agent_office uuid, split numeric, token_hash text, agent_phone text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare out_id uuid; office_name text; clean_email text := lower(trim(agent_email));
begin
  if not private.has_cap(ws, 'agents.invite') then raise exception 'You are not allowed to invite agents.' using errcode = '42501'; end if;
  if char_length(trim(coalesce(agent_name, ''))) < 2 then raise exception 'Each agent needs a name.'; end if;
  if clean_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]{2,}$' then raise exception 'The email for % does not look right.', trim(agent_name); end if;
  if split is null or split < 0 or split > 100 then raise exception 'The split for % must be between 0 and 100.', trim(agent_name); end if;
  if token_hash !~ '^[0-9a-f]{64}$' then raise exception 'bad token'; end if;
  if exists (select 1 from public.agents a where a.workspace_id = ws and lower(a.email) = clean_email) then
    raise exception '% is already on file.', clean_email; end if;
  select o.name into office_name from public.offices o where o.id = agent_office and o.workspace_id = ws;
  if office_name is null then raise exception 'Choose an office for %.', trim(agent_name); end if;

  perform set_config('kinu.trusted', 'on', true);
  insert into public.agents (workspace_id, full_name, email, phone, office, office_id, cohort, status, licence_status,
                             w9_status, rider_status, onboarding_status, invite_token_hash, invite_expires_at, invite_sent_at, joined_on)
  values (ws, trim(agent_name), clean_email, nullif(trim(coalesce(agent_phone, '')), ''), office_name, agent_office,
          to_char(now(), 'YYYY-MM'), 'invited', 'not_uploaded', 'pending', 'sent', 'in_progress',
          token_hash, now() + interval '14 days', now(), current_date)
  returning id into out_id;
  perform set_config('kinu.trusted', 'off', true);

  perform private.make_rider(ws, out_id, null, split,
    '[{"from":0,"to":20000,"pct":70},{"from":20000,"to":40000,"pct":80},{"from":40000,"to":null,"pct":85}]'::jsonb, 'sent', null);
  perform private.note_invite(ws);
  return out_id;
end;
$$;

-- A fresh link for someone already invited (the old one stops working).
create or replace function public.reissue_invite(ws uuid, agent uuid, token_hash text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not private.has_cap(ws, 'agents.invite') then raise exception 'You are not allowed to invite agents.' using errcode = '42501'; end if;
  if token_hash !~ '^[0-9a-f]{64}$' then raise exception 'bad token'; end if;
  perform set_config('kinu.trusted', 'on', true);
  update public.agents set invite_token_hash = token_hash, invite_expires_at = now() + interval '14 days', invite_sent_at = now()
   where id = agent and workspace_id = ws and onboarding_status <> 'ready';
  if not found then raise exception 'That agent has already finished onboarding.'; end if;
  perform set_config('kinu.trusted', 'off', true);
end;
$$;

-- Staff confirm (or flag) a licence after checking it against the state record.
create or replace function public.review_licence(ws uuid, agent uuid, verdict text, note text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not private.has_cap(ws, 'riders.manage') then raise exception 'You are not allowed to verify documents.' using errcode = '42501'; end if;
  if verdict not in ('verified', 'mismatch') then raise exception 'unknown verdict'; end if;
  perform set_config('kinu.trusted', 'on', true);
  update public.agents set licence_status = verdict,
         licence_note = case when verdict = 'verified' then null else coalesce(nullif(trim(note), ''), 'number mismatch') end
   where id = agent and workspace_id = ws;
  perform private.refresh_onboarding(agent);
  perform set_config('kinu.trusted', 'off', true);
  perform private.log(ws, verdict, 'licence', agent::text,
    case when verdict = 'verified' then 'Licence confirmed against the state record' else 'Licence flagged: ' || coalesce(note, 'mismatch') end);
end;
$$;

-- Works out where an agent stands from the facts on file.
create or replace function private.refresh_onboarding(agent uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare a record; ready boolean; flagged boolean; was text;
begin
  select * into a from public.agents where id = agent;
  if not found then return; end if;
  was := a.onboarding_status;
  flagged := a.licence_status in ('mismatch', 'expiring') or a.w9_status = 'name_mismatch';
  ready := a.licence_status = 'verified' and a.w9_status = 'received' and a.rider_status = 'signed' and a.details_done_at is not null;
  update public.agents set
    onboarding_status = case when flagged then 'flagged' when ready then 'ready' else 'in_progress' end,
    status = case when a.status = 'exited' then 'exited' when flagged then 'flagged' when ready then 'active' else 'onboarding' end
  where id = agent;
  if ready and not flagged and was <> 'ready' then
    update public.onboarding_batches b set ready_count = least(b.sent_count, b.ready_count + 1)
     where b.id = (select b2.id from public.onboarding_batches b2
                    where b2.workspace_id = a.workspace_id and b2.ready_count < b2.sent_count
                      and b2.sent_at <= coalesce(a.invite_sent_at, now()) + interval '1 hour'
                    order by b2.sent_at desc limit 1);
  end if;
end;
$$;

-- --------------------------------------------------------------- portal --

create or replace function private.portal_agent(token_hash text)
returns public.agents language plpgsql stable security definer set search_path = '' as $$
declare a public.agents;
begin
  if token_hash is null or token_hash !~ '^[0-9a-f]{64}$' then return null; end if;
  select * into a from public.agents ag
   where ag.invite_token_hash = token_hash and ag.invite_expires_at > now() and ag.status <> 'exited';
  if not found then return null; end if;
  return a;
end;
$$;

-- What the agent sees: only their own record, and only what they need.
create or replace function public.portal_state(token_hash text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare a public.agents; r record;
begin
  a := private.portal_agent(token_hash);
  if a.id is null then return null; end if;
  select rd.id, rd.split_pct, rd.tiers, rd.status, rd.version into r from public.riders rd
   where rd.agent_id = a.id and rd.status in ('sent', 'signed') order by rd.version desc limit 1;
  return jsonb_build_object(
    'brokerage', (select w.name from public.workspaces w where w.id = a.workspace_id),
    'full_name', a.full_name, 'email', a.email, 'phone', a.phone, 'office', a.office,
    'details_done', a.details_done_at is not null,
    'licence_status', a.licence_status, 'licence_masked', a.licence_masked, 'licence_expires_on', a.licence_expires_on,
    'has_licence_photo', a.licence_file_path is not null,
    'w9_status', a.w9_status,
    'rider', case when r.id is null then null else jsonb_build_object('split_pct', r.split_pct, 'tiers', r.tiers, 'status', r.status, 'version', r.version) end,
    'rider_status', a.rider_status,
    'upload_prefix', a.workspace_id::text || '/agents/' || a.id::text,
    'expires_at', a.invite_expires_at);
end;
$$;

create or replace function public.portal_save_details(token_hash text, new_name text, new_phone text)
returns void language plpgsql security definer set search_path = '' as $$
declare a public.agents;
begin
  a := private.portal_agent(token_hash);
  if a.id is null then raise exception 'This link has expired. Ask your brokerage for a new one.'; end if;
  if char_length(trim(coalesce(new_name, ''))) < 2 then raise exception 'Enter your full name.'; end if;
  if regexp_replace(coalesce(new_phone, ''), '\D', '', 'g') !~ '^\d{10,15}$' then raise exception 'Enter a phone number with area code.'; end if;
  perform set_config('kinu.trusted', 'on', true); perform set_config('kinu.actor', trim(new_name) || ' (agent)', true);
  update public.agents set full_name = trim(new_name), phone = trim(new_phone), details_done_at = now(),
         status = case when status = 'invited' then 'onboarding' else status end where id = a.id;
  perform private.refresh_onboarding(a.id);
end;
$$;

create or replace function public.portal_save_licence(token_hash text, licence_no text, licence_st text, expires date, file_path text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare a public.agents; digits text := regexp_replace(coalesce(licence_no, ''), '[^0-9A-Za-z]', '', 'g');
begin
  a := private.portal_agent(token_hash);
  if a.id is null then raise exception 'This link has expired. Ask your brokerage for a new one.'; end if;
  if char_length(digits) < 6 or char_length(digits) > 20 then raise exception 'Enter your licence number as it appears on the licence.'; end if;
  if expires is null or expires <= current_date then raise exception 'Enter the expiry date on your licence. It must be in the future.'; end if;
  if file_path is not null and file_path not like a.workspace_id::text || '/agents/' || a.id::text || '/%' then
    raise exception 'That file does not belong to this record.'; end if;
  perform set_config('kinu.trusted', 'on', true); perform set_config('kinu.actor', a.full_name || ' (agent)', true);
  update public.agents set
    licence_number = digits,
    licence_masked = left(digits, 5) || ' ••• ' || right(digits, 3),
    licence_state = upper(left(trim(coalesce(licence_st, 'NY')), 2)),
    licence_expires_on = expires,
    licence_file_path = coalesce(file_path, licence_file_path),
    -- A person at the brokerage confirms it against the state record.
    licence_status = 'submitted',
    licence_note = 'Waiting for the brokerage to confirm against the state record'
  where id = a.id;
  if file_path is not null then
    insert into public.documents (workspace_id, agent_id, kind, filename, path, status, note)
    values (a.workspace_id, a.id, 'licence', a.full_name || ' · licence', file_path, 'check', 'Uploaded by the agent · waiting for confirmation');
  end if;
  perform private.refresh_onboarding(a.id);
end;
$$;

-- W-9. Kinu never receives a full taxpayer number: the W-9 service will hold
-- it. Until that service is connected this records the legal name and the
-- last four digits only.
create or replace function public.portal_save_w9(token_hash text, legal text, last4 text, reference text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare a public.agents; mismatch boolean;
begin
  a := private.portal_agent(token_hash);
  if a.id is null then raise exception 'This link has expired. Ask your brokerage for a new one.'; end if;
  if char_length(trim(coalesce(legal, ''))) < 2 then raise exception 'Enter your legal name as it appears on your tax return.'; end if;
  if coalesce(last4, '') !~ '^[0-9]{4}$' then raise exception 'Enter only the last four digits.'; end if;
  mismatch := lower(regexp_replace(trim(legal), '\s+', ' ', 'g')) <> lower(regexp_replace(a.full_name, '\s+', ' ', 'g'));
  perform set_config('kinu.trusted', 'on', true); perform set_config('kinu.actor', a.full_name || ' (agent)', true);
  insert into public.agent_tax (agent_id, workspace_id, legal_name, tin_last4, provider_ref, received_at)
  values (a.id, a.workspace_id, trim(legal), last4, coalesce(reference, 'placeholder'), now())
  on conflict (agent_id) do update set legal_name = excluded.legal_name, tin_last4 = excluded.tin_last4,
    provider_ref = excluded.provider_ref, received_at = now();
  update public.agents set w9_status = case when mismatch then 'name_mismatch' else 'received' end where id = a.id;
  insert into public.documents (workspace_id, agent_id, kind, filename, status, note)
  select a.workspace_id, a.id, 'w9', a.full_name || ' · W-9 (held by W-9 service)', 'on_file', 'TIN on file · masked'
   where not exists (select 1 from public.documents d where d.agent_id = a.id and d.kind = 'w9');
  if mismatch then
    insert into public.attention_items (workspace_id, agent_id, tag, detail, position)
    values (a.workspace_id, a.id, 'W-9', format('“%s” on W-9, “%s” on file', trim(legal), a.full_name), 0);
  end if;
  perform private.refresh_onboarding(a.id);
end;
$$;

-- E-signature: consent, a typed name as clear intent, and a time stamp, all
-- recorded against the rider and in the audit log.
create or replace function public.portal_sign_rider(token_hash text, typed_name text, consent boolean, signer_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare a public.agents; r record;
begin
  a := private.portal_agent(token_hash);
  if a.id is null then raise exception 'This link has expired. Ask your brokerage for a new one.'; end if;
  if not coalesce(consent, false) then raise exception 'Tick the box to agree to sign electronically.'; end if;
  if lower(regexp_replace(trim(coalesce(typed_name, '')), '\s+', ' ', 'g')) <> lower(regexp_replace(a.full_name, '\s+', ' ', 'g')) then
    raise exception 'Type your full name exactly as shown: %', a.full_name; end if;
  select * into r from public.riders rd where rd.agent_id = a.id and rd.status = 'sent' order by rd.version desc limit 1;
  if not found then raise exception 'There is no rider waiting for your signature.'; end if;
  perform set_config('kinu.trusted', 'on', true); perform set_config('kinu.actor', a.full_name || ' (agent)', true);
  update public.riders set is_current = false, status = 'superseded' where agent_id = a.id and is_current;
  update public.riders set status = 'signed', is_current = true, signed_at = now(), signed_name = trim(typed_name),
         signed_consent = true, signature_note = coalesce(signer_note, 'E-signature') where id = r.id;
  update public.agents set rider_status = 'signed' where id = a.id;
  insert into public.documents (workspace_id, agent_id, kind, filename, status, note)
  values (a.workspace_id, a.id, 'rider', format('%s · individual rider v%s', a.full_name, r.version), 'signed', 'E-signature · consent and time recorded');
  perform private.log(a.workspace_id, 'sign', 'riders', r.id::text,
    format('Individual rider v%s signed at %s%%', r.version, trim(to_char(r.split_pct, 'FM990.##'), '.')));
  perform private.refresh_onboarding(a.id);
end;
$$;

do $$
declare f text;
begin
  -- Staff functions: signed-in users, checked inside.
  foreach f in array array[
    'public.invite_agent(uuid, text, text, uuid, numeric, text, text)',
    'public.reissue_invite(uuid, uuid, text)', 'public.review_licence(uuid, uuid, text, text)'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
  -- Portal functions: the server only. Browsers (anon and signed-in users) cannot call them.
  foreach f in array array[
    'public.portal_state(text)', 'public.portal_save_details(text, text, text)',
    'public.portal_save_licence(text, text, text, date, text)', 'public.portal_save_w9(text, text, text, text)',
    'public.portal_sign_rider(text, text, boolean, text)'] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    if exists (select 1 from pg_roles where rolname = 'service_role') then
      execute format('grant execute on function %s to service_role', f);
    end if;
  end loop;
end $$;
