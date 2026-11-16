-- Riders sent for electronic signature through the brokerage's Documenso.
-- Safe to run more than once.

-- The brokerage's own rider document (a PDF in private storage). Optional.
alter table public.workspaces add column if not exists rider_template_path text;
alter table public.workspaces add column if not exists rider_template_name text;

-- For a team rider: does the team lead sign for the team, or every member?
alter table public.riders add column if not exists sign_mode text;
do $$ begin
  alter table public.riders add constraint riders_sign_mode_check check (sign_mode is null or sign_mode in ('lead', 'members'));
exception when duplicate_object then null; end $$;

create table if not exists public.sign_requests (
  id                uuid primary key default gen_random_uuid(),
  workspace_id      uuid not null references public.workspaces (id) on delete cascade,
  rider_id          uuid not null references public.riders (id) on delete cascade,
  agent_id          uuid not null references public.agents (id) on delete cascade,
  signer_name       text not null check (char_length(signer_name) between 1 and 160),
  signer_email      text not null check (char_length(signer_email) between 3 and 254),
  envelope_id       text not null check (char_length(envelope_id) between 1 and 120),
  status            text not null default 'sent' check (status in ('sent', 'opened', 'signed', 'declined', 'cancelled')),
  sent_at           timestamptz not null default now(),
  completed_at      timestamptz,
  file_path         text,
  certificate_path  text,
  created_by        uuid references auth.users (id) on delete set null
);
create index if not exists sign_requests_rider_idx on public.sign_requests (workspace_id, rider_id);
create index if not exists sign_requests_agent_idx on public.sign_requests (workspace_id, agent_id);

alter table public.sign_requests enable row level security;
alter table public.sign_requests force row level security;
revoke all on table public.sign_requests from anon, authenticated;
grant select on table public.sign_requests to authenticated;
drop policy if exists "read" on public.sign_requests;
create policy "read" on public.sign_requests for select to authenticated
  using (private.has_cap(workspace_id, 'splits.view') or private.has_cap(workspace_id, 'riders.manage'));

-- People who manage riders may store rider files (the template and signed copies).
drop policy if exists "kinu riders add documents" on storage.objects;
create policy "kinu riders add documents" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'documents' and private.has_cap(private.path_workspace(name), 'riders.manage'));
drop policy if exists "kinu riders read documents" on storage.objects;
create policy "kinu riders read documents" on storage.objects
  for select to authenticated
  using (bucket_id = 'documents' and private.has_cap(private.path_workspace(name), 'riders.manage'));

create or replace function public.set_rider_template(ws uuid, file_path text, file_name text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not private.has_cap(ws, 'riders.manage') then raise exception 'You are not allowed to change the rider document.' using errcode = '42501'; end if;
  if file_path is not null and file_path not like ws::text || '/riders/%' then raise exception 'That file is not in this brokerage.'; end if;
  perform set_config('kinu.trusted', 'on', true);
  update public.workspaces set rider_template_path = file_path, rider_template_name = left(nullif(trim(coalesce(file_name, '')), ''), 120) where id = ws;
  perform set_config('kinu.trusted', 'off', true);
end;
$$;

-- Records that a rider went out to one signer. The envelope was created by our
-- server with the brokerage's Documenso key just before this is called.
create or replace function public.open_sign_request(ws uuid, rider uuid, agent uuid, name text, email text, envelope text, mode text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare r record; made uuid;
begin
  if not private.has_cap(ws, 'riders.manage') then raise exception 'You are not allowed to send riders for signature.' using errcode = '42501'; end if;
  select * into r from public.riders where id = rider and workspace_id = ws and status in ('draft', 'sent');
  if not found then raise exception 'That rider is not waiting for a signature.'; end if;
  if not exists (select 1 from public.agents a where a.id = agent and a.workspace_id = ws) then raise exception 'That agent could not be found.'; end if;
  if r.agent_id is not null and r.agent_id <> agent then raise exception 'That rider belongs to a different agent.'; end if;
  if r.team_id is not null and not exists (
       select 1 from public.teams t where t.id = r.team_id and t.lead_agent_id = agent
       union all select 1 from public.team_members m where m.team_id = r.team_id and m.agent_id = agent) then
    raise exception 'That agent is not on this team.';
  end if;
  if exists (select 1 from public.sign_requests s where s.rider_id = rider and s.agent_id = agent and s.status in ('sent', 'opened')) then
    raise exception 'This rider is already out for signature with that person.';
  end if;
  insert into public.sign_requests (workspace_id, rider_id, agent_id, signer_name, signer_email, envelope_id, created_by)
  values (ws, rider, agent, left(trim(name), 160), left(lower(trim(email)), 254), left(envelope, 120), auth.uid())
  returning id into made;
  perform set_config('kinu.trusted', 'on', true);
  update public.riders set status = 'sent', sign_mode = case when r.team_id is not null and mode in ('lead', 'members') then mode else sign_mode end where id = rider;
  perform set_config('kinu.trusted', 'off', true);
  return made;
end;
$$;

-- Records what our server read back from Documenso for one request. When the
-- last open request on a rider is signed, the rider becomes the current one,
-- exactly as when staff record a signature by hand.
create or replace function public.update_sign_request(ws uuid, request uuid, new_status text, signed_file text, certificate_file text)
returns text language plpgsql security definer set search_path = '' as $$
declare s record; r record; names text;
begin
  if not private.has_cap(ws, 'riders.manage') then raise exception 'You are not allowed to update signature requests.' using errcode = '42501'; end if;
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
$$;

do $$
declare f text;
begin
  foreach f in array array['public.set_rider_template(uuid, text, text)', 'public.open_sign_request(uuid, uuid, uuid, text, text, text, text)',
    'public.update_sign_request(uuid, uuid, text, text, text)'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
-- Documents to sign: a brokerage's own PDF with signing boxes placed on it,
-- sent to one or more people through the signing service. Safe to run more than once.

create table if not exists public.sign_templates (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces (id) on delete cascade,
  name          text not null check (char_length(name) between 2 and 120),
  file_path     text not null,
  page_count    integer not null check (page_count between 1 and 200),
  roles         jsonb not null default '["Agent"]',   -- who signs, in order: ["Agent", "Broker"]
  fields        jsonb not null default '[]',          -- the boxes: type, role, page and place in percent of the page
  active        boolean not null default true,
  created_by    uuid references auth.users (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists sign_templates_ws_idx on public.sign_templates (workspace_id, active);

create table if not exists public.sign_documents (
  id                uuid primary key default gen_random_uuid(),
  workspace_id      uuid not null references public.workspaces (id) on delete cascade,
  template_id       uuid references public.sign_templates (id) on delete set null,
  title             text not null check (char_length(title) between 2 and 200),
  envelope_id       text not null check (char_length(envelope_id) between 1 and 120),
  status            text not null default 'sent' check (status in ('sent', 'opened', 'signed', 'declined', 'cancelled')),
  signers           jsonb not null,                   -- [{name, email, role, agent_id, status}]
  agent_ids         uuid[] not null default '{}',     -- whose files the signed copy goes into
  sent_at           timestamptz not null default now(),
  completed_at      timestamptz,
  file_path         text,
  certificate_path  text,
  created_by        uuid references auth.users (id) on delete set null
);
create index if not exists sign_documents_ws_idx on public.sign_documents (workspace_id, status, sent_at desc);

do $$
declare t text;
begin
  foreach t in array array['sign_templates', 'sign_documents'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('revoke all on table public.%I from anon, authenticated', t);
    execute format('grant select on table public.%I to authenticated', t);
    execute format('drop policy if exists "read" on public.%I', t);
    execute format($p$create policy "read" on public.%I for select to authenticated
      using (private.has_cap(workspace_id, 'files.view') or private.has_cap(workspace_id, 'files.manage') or private.has_cap(workspace_id, 'riders.manage'))$p$, t);
  end loop;
end $$;

create or replace function private.can_send_documents(ws uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.has_cap(ws, 'files.manage') or private.has_cap(ws, 'riders.manage');
$$;
grant execute on function private.can_send_documents(uuid) to authenticated;

-- Checks the list of boxes before it is stored: known types only, on a real
-- page, inside the page, for a signer that exists.
create or replace function private.check_sign_fields(fields jsonb, role_count integer, pages integer)
returns void language plpgsql immutable set search_path = '' as $$
declare f jsonb;
begin
  if jsonb_typeof(fields) <> 'array' or jsonb_array_length(fields) > 300 then raise exception 'Too many boxes on this document.'; end if;
  for f in select * from jsonb_array_elements(fields) loop
    if coalesce(f->>'type', '') not in ('signature', 'initials', 'name', 'date', 'text', 'email') then raise exception 'One of the boxes has an unknown type.'; end if;
    if (f->>'role')::int < 0 or (f->>'role')::int >= role_count then raise exception 'One of the boxes is for a signer that does not exist.'; end if;
    if (f->>'page')::int < 1 or (f->>'page')::int > pages then raise exception 'One of the boxes is on a page that does not exist.'; end if;
    if (f->>'x')::numeric < 0 or (f->>'y')::numeric < 0 or (f->>'w')::numeric < 1 or (f->>'h')::numeric < 0.5
       or (f->>'x')::numeric + (f->>'w')::numeric > 100.01 or (f->>'y')::numeric + (f->>'h')::numeric > 100.01 then
      raise exception 'One of the boxes is outside its page.';
    end if;
    if char_length(coalesce(f->>'label', '')) > 80 then raise exception 'A box label is too long.'; end if;
  end loop;
end;
$$;

create or replace function public.save_sign_template(ws uuid, template uuid, template_name text, path text, pages integer, signer_roles jsonb, boxes jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare made uuid; n integer;
begin
  if not private.can_send_documents(ws) then raise exception 'You are not allowed to change documents to sign.' using errcode = '42501'; end if;
  if jsonb_typeof(signer_roles) <> 'array' then raise exception 'Add at least one signer.'; end if;
  n := jsonb_array_length(signer_roles);
  if n < 1 or n > 6 then raise exception 'A document can have one to six signers.'; end if;
  if exists (select 1 from jsonb_array_elements_text(signer_roles) r where char_length(trim(r)) not between 1 and 40) then raise exception 'Give every signer a short name, like Agent or Broker.'; end if;
  if template is null then
    if path is null or path not like ws::text || '/sign/%' then raise exception 'That file is not in this brokerage.'; end if;
    perform private.check_sign_fields(boxes, n, pages);
    insert into public.sign_templates (workspace_id, name, file_path, page_count, roles, fields, created_by)
    values (ws, left(trim(template_name), 120), path, pages, signer_roles, boxes, auth.uid()) returning id into made;
    return made;
  end if;
  select page_count into pages from public.sign_templates where id = template and workspace_id = ws and active;
  if not found then raise exception 'That document could not be found.'; end if;
  perform private.check_sign_fields(boxes, n, pages);
  update public.sign_templates set name = left(trim(template_name), 120), roles = signer_roles, fields = boxes, updated_at = now() where id = template;
  return template;
end;
$$;

create or replace function public.remove_sign_template(ws uuid, template uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not private.can_send_documents(ws) then raise exception 'You are not allowed to change documents to sign.' using errcode = '42501'; end if;
  update public.sign_templates set active = false, updated_at = now() where id = template and workspace_id = ws;
end;
$$;

-- Records that a document went out. The envelope was created by our server
-- with the signing key just before this is called.
create or replace function public.open_sign_document(ws uuid, template uuid, doc_title text, envelope text, people jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare made uuid; agents uuid[];
begin
  if not private.can_send_documents(ws) then raise exception 'You are not allowed to send documents for signature.' using errcode = '42501'; end if;
  if jsonb_typeof(people) <> 'array' or jsonb_array_length(people) not between 1 and 6 then raise exception 'A document needs one to six signers.'; end if;
  if exists (select 1 from jsonb_array_elements(people) p where char_length(coalesce(p->>'name', '')) not between 1 and 160 or coalesce(p->>'email', '') !~ '^[^\s@]+@[^\s@]+\.[^\s@]{2,}$') then
    raise exception 'Every signer needs a name and an email address.';
  end if;
  select coalesce(array_agg(distinct (p->>'agent_id')::uuid), '{}') into agents from jsonb_array_elements(people) p where nullif(p->>'agent_id', '') is not null;
  if exists (select 1 from unnest(agents) a where not exists (select 1 from public.agents x where x.id = a and x.workspace_id = ws)) then
    raise exception 'One of the agents could not be found.';
  end if;
  if template is not null and not exists (select 1 from public.sign_templates t where t.id = template and t.workspace_id = ws) then raise exception 'That document could not be found.'; end if;
  insert into public.sign_documents (workspace_id, template_id, title, envelope_id, signers, agent_ids, created_by)
  values (ws, template, left(trim(doc_title), 200), left(envelope, 120),
          (select jsonb_agg(jsonb_build_object('name', left(p->>'name', 160), 'email', lower(p->>'email'), 'role', left(coalesce(p->>'role', ''), 40), 'agent_id', nullif(p->>'agent_id', ''), 'status', 'sent')) from jsonb_array_elements(people) p),
          agents, auth.uid())
  returning id into made;
  return made;
end;
$$;

-- Records what our server read back from the signing service. When it is
-- complete, the signed copy and certificate go into each agent's file.
create or replace function public.update_sign_document(ws uuid, doc uuid, new_status text, signer_states jsonb, signed_file text, certificate_file text)
returns text language plpgsql security definer set search_path = '' as $$
declare d record; a uuid; merged jsonb;
begin
  if not private.can_send_documents(ws) then raise exception 'You are not allowed to update documents for signature.' using errcode = '42501'; end if;
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
$$;

-- People who send documents may store them (templates and signed copies) and read them back.
drop policy if exists "kinu sign add documents" on storage.objects;
create policy "kinu sign add documents" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'documents' and private.can_send_documents(private.path_workspace(name)));
drop policy if exists "kinu sign read documents" on storage.objects;
create policy "kinu sign read documents" on storage.objects
  for select to authenticated
  using (bucket_id = 'documents' and private.can_send_documents(private.path_workspace(name)));

do $$
declare f text;
begin
  foreach f in array array['public.save_sign_template(uuid, uuid, text, text, integer, jsonb, jsonb)', 'public.remove_sign_template(uuid, uuid)',
    'public.open_sign_document(uuid, uuid, text, text, jsonb)', 'public.update_sign_document(uuid, uuid, text, jsonb, text, text)'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
-- A person chooses their own name the first time they sign in, so greetings
-- and lists show it instead of a name guessed from their email. Safe to run more than once.
create or replace function public.set_my_name(full_name text)
returns void language plpgsql security definer set search_path = '' as $$
declare n text := trim(regexp_replace(coalesce(full_name, ''), '\s+', ' ', 'g'));
begin
  if auth.uid() is null then raise exception 'Sign in first.' using errcode = '42501'; end if;
  if char_length(n) not between 2 and 120 then raise exception 'Enter your first and last name.'; end if;
  perform set_config('kinu.trusted', 'on', true);
  update public.workspace_members set display_name = n where user_id = auth.uid();
  perform set_config('kinu.trusted', 'off', true);
end;
$$;
revoke all on function public.set_my_name(text) from public, anon;
grant execute on function public.set_my_name(text) to authenticated;
-- Automation: each brokerage sets its own rules once, and Kinu then does the
-- repetitive steps by itself. Safe to run more than once.

create table if not exists public.automation (
  workspace_id          uuid primary key references public.workspaces (id) on delete cascade,
  default_tiers         jsonb not null default '[{"from":0,"to":20000,"pct":70},{"from":20000,"to":40000,"pct":80},{"from":40000,"to":null,"pct":85}]',
  send_pack_on_invite   boolean not null default true,    -- send the "new agent" documents when an agent is invited
  send_rider_on_invite  boolean not null default false,   -- send the first rider for signature when an agent is invited
  send_rider_on_tier    boolean not null default false,   -- after a tier move is approved, send the new rider for signature
  team_rider_mode       text not null default 'lead' check (team_rider_mode in ('lead', 'members')),
  updated_at            timestamptz not null default now()
);
alter table public.automation enable row level security;
alter table public.automation force row level security;
revoke all on table public.automation from anon, authenticated;
grant select on table public.automation to authenticated;
drop policy if exists "read" on public.automation;
create policy "read" on public.automation for select to authenticated using (private.has_cap(workspace_id, 'agents.view'));

-- The tiers a new agent starts on: the brokerage's own, or Kinu's starting set.
create or replace function private.default_tiers(ws uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce((select a.default_tiers from public.automation a where a.workspace_id = ws),
    '[{"from":0,"to":20000,"pct":70},{"from":20000,"to":40000,"pct":80},{"from":40000,"to":null,"pct":85}]'::jsonb);
$$;

create or replace function public.set_automation(ws uuid, tiers jsonb, pack_on_invite boolean, rider_on_invite boolean, rider_on_tier boolean, team_mode text)
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
  insert into public.automation (workspace_id, default_tiers, send_pack_on_invite, send_rider_on_invite, send_rider_on_tier, team_rider_mode)
  values (ws, tiers, pack_on_invite, rider_on_invite, rider_on_tier, team_mode)
  on conflict (workspace_id) do update set default_tiers = excluded.default_tiers, send_pack_on_invite = excluded.send_pack_on_invite,
    send_rider_on_invite = excluded.send_rider_on_invite, send_rider_on_tier = excluded.send_rider_on_tier,
    team_rider_mode = excluded.team_rider_mode, updated_at = now();
end;
$$;

-- Document packs: a document can go out by itself when an agent is invited, or when one leaves.
alter table public.sign_templates add column if not exists pack text not null default 'none';
alter table public.sign_templates add column if not exists default_signers jsonb not null default '[]';
do $$ begin
  alter table public.sign_templates add constraint sign_templates_pack_check check (pack in ('none', 'invite', 'exit'));
exception when duplicate_object then null; end $$;

-- `people` lists who signs each role after the first (the first is always the agent): [{name, email}, ...]
create or replace function public.set_template_pack(ws uuid, template uuid, new_pack text, people jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare t record;
begin
  if not private.can_send_documents(ws) then raise exception 'You are not allowed to change documents to sign.' using errcode = '42501'; end if;
  if new_pack not in ('none', 'invite', 'exit') then raise exception 'Unknown choice.'; end if;
  select * into t from public.sign_templates where id = template and workspace_id = ws and active;
  if not found then raise exception 'That document could not be found.'; end if;
  if jsonb_typeof(people) <> 'array' then raise exception 'The signers could not be read.'; end if;
  if new_pack <> 'none' then
    if jsonb_array_length(people) <> jsonb_array_length(t.roles) - 1 then raise exception 'Say who signs each of the other roles, so this can be sent without anyone having to choose.'; end if;
    if exists (select 1 from jsonb_array_elements(people) p where char_length(coalesce(p->>'name', '')) not between 2 and 160 or coalesce(p->>'email', '') !~ '^[^\s@]+@[^\s@]+\.[^\s@]{2,}$') then
      raise exception 'Each of the other signers needs a name and an email address.';
    end if;
  end if;
  update public.sign_templates set pack = new_pack, default_signers = people, updated_at = now() where id = template;
end;
$$;

-- A rider that a tier approval has already made current can still be sent to
-- the agent to sign as their record. Pay does not wait for it and its status
-- does not change: the approval is what made it current.
create or replace function public.open_sign_request(ws uuid, rider uuid, agent uuid, name text, email text, envelope text, mode text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare r record; made uuid;
begin
  if not private.has_cap(ws, 'riders.manage') then raise exception 'You are not allowed to send riders for signature.' using errcode = '42501'; end if;
  select * into r from public.riders where id = rider and workspace_id = ws and (status in ('draft', 'sent') or (status = 'signed' and is_current));
  if not found then raise exception 'That rider is not waiting for a signature.'; end if;
  if not exists (select 1 from public.agents a where a.id = agent and a.workspace_id = ws) then raise exception 'That agent could not be found.'; end if;
  if r.agent_id is not null and r.agent_id <> agent then raise exception 'That rider belongs to a different agent.'; end if;
  if r.team_id is not null and not exists (
       select 1 from public.teams t where t.id = r.team_id and t.lead_agent_id = agent
       union all select 1 from public.team_members m where m.team_id = r.team_id and m.agent_id = agent) then
    raise exception 'That agent is not on this team.';
  end if;
  if exists (select 1 from public.sign_requests s where s.rider_id = rider and s.agent_id = agent and s.status in ('sent', 'opened')) then
    raise exception 'This rider is already out for signature with that person.';
  end if;
  insert into public.sign_requests (workspace_id, rider_id, agent_id, signer_name, signer_email, envelope_id, created_by)
  values (ws, rider, agent, left(trim(name), 160), left(lower(trim(email)), 254), left(envelope, 120), auth.uid())
  returning id into made;
  perform set_config('kinu.trusted', 'on', true);
  update public.riders set status = case when r.status = 'signed' then r.status else 'sent' end, sign_mode = case when r.team_id is not null and mode in ('lead', 'members') then mode else sign_mode end where id = rider;
  perform set_config('kinu.trusted', 'off', true);
  return made;
end;
$$;

-- Inviting an agent now starts them on the brokerage's own tiers.
CREATE OR REPLACE FUNCTION public.invite_agent(ws uuid, agent_name text, agent_email text, agent_office uuid, split numeric, token_hash text, agent_phone text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    private.default_tiers(ws), 'sent', null);
  perform private.note_invite(ws);
  return out_id;
end;
$function$;

do $$
declare f text;
begin
  foreach f in array array['public.set_automation(uuid, jsonb, boolean, boolean, boolean, text)', 'public.set_template_pack(uuid, uuid, text, jsonb)'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
-- Licence checks, the same way in every state: Kinu shows the record and its
-- own consistency checks; a person at the brokerage confirms or flags, and the
-- result carries who checked it, when, and against what. Safe to run more than once.

alter table public.agents add column if not exists licence_checked_at timestamptz;
alter table public.agents add column if not exists licence_checked_by text;
alter table public.agents add column if not exists licence_source text;

-- The official look-up page for each state this brokerage works in. The
-- brokerage enters it once; staff then reach the state record in one click.
create table if not exists public.licence_lookups (
  workspace_id  uuid not null references public.workspaces (id) on delete cascade,
  state         text not null check (state ~ '^[A-Z]{2}$'),
  url           text not null,
  updated_at    timestamptz not null default now(),
  primary key (workspace_id, state)
);
alter table public.licence_lookups drop constraint if exists licence_lookups_url_check;
alter table public.licence_lookups add constraint licence_lookups_url_check check (url ~ '^https://\S+$' and char_length(url) between 12 and 400);
alter table public.licence_lookups enable row level security;
alter table public.licence_lookups force row level security;
revoke all on table public.licence_lookups from anon, authenticated;
grant select on table public.licence_lookups to authenticated;
drop policy if exists "read" on public.licence_lookups;
create policy "read" on public.licence_lookups for select to authenticated using (private.has_cap(workspace_id, 'agents.view'));

create or replace function public.set_licence_lookup(ws uuid, lookup_state text, lookup_url text)
returns void language plpgsql security definer set search_path = '' as $$
declare st text := upper(trim(coalesce(lookup_state, ''))); link text := trim(coalesce(lookup_url, ''));
begin
  if not private.has_cap(ws, 'settings.manage') then raise exception 'You are not allowed to change these settings.' using errcode = '42501'; end if;
  if st !~ '^[A-Z]{2}$' then raise exception 'Use the two-letter state code, like NY.'; end if;
  if link = '' then delete from public.licence_lookups where workspace_id = ws and state = st; return; end if;
  if link !~ '^https://\S+$' or char_length(link) not between 12 and 400 then raise exception 'Paste the full address of the state’s look-up page, starting with https://'; end if;
  insert into public.licence_lookups (workspace_id, state, url) values (ws, st, link)
  on conflict (workspace_id, state) do update set url = excluded.url, updated_at = now();
end;
$$;

-- Confirming or flagging a licence now records who, when and against what.
create or replace function public.review_licence(ws uuid, agent uuid, verdict text, note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare who text;
begin
  if not private.has_cap(ws, 'riders.manage') then raise exception 'You are not allowed to verify documents.' using errcode = '42501'; end if;
  if verdict not in ('verified', 'mismatch') then raise exception 'unknown verdict'; end if;
  select coalesce(nullif(trim(m.display_name), ''), m.email) into who from public.workspace_members m where m.workspace_id = ws and m.user_id = auth.uid() limit 1;
  perform set_config('kinu.trusted', 'on', true);
  update public.agents set licence_status = verdict,
         licence_note = case when verdict = 'verified' then null else coalesce(nullif(trim(note), ''), 'number mismatch') end,
         licence_checked_at = now(), licence_checked_by = left(coalesce(who, 'Brokerage staff'), 160),
         licence_source = 'Checked by a person at the brokerage against the state''s public record'
   where id = agent and workspace_id = ws;
  perform private.refresh_onboarding(agent);
  perform set_config('kinu.trusted', 'off', true);
  perform private.log(ws, verdict, 'licence', agent::text,
    case when verdict = 'verified' then 'Licence confirmed against the state record' else 'Licence flagged: ' || coalesce(note, 'mismatch') end);
end;
$$;

revoke all on function public.set_licence_lookup(uuid, text, text) from public, anon;
grant execute on function public.set_licence_lookup(uuid, text, text) to authenticated;
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
