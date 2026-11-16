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
