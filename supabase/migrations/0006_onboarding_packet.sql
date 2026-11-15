-- Kinu: the onboarding packet. Each brokerage lists the paperwork a new agent
-- must sign, acknowledge or upload, plus steps that happen outside Kinu.
-- Safe to run more than once.
--
-- By design the packet never collects full taxpayer numbers, bank details,
-- dates of birth or ID scans. Those stay with the W-9 service and the
-- brokerage's own payroll system; the packet only tracks that they are done.

create table if not exists public.packet_items (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces (id) on delete cascade,
  title         text not null check (char_length(title) between 2 and 120),
  kind          text not null check (kind in ('sign', 'acknowledge', 'upload', 'outside')),
  body          text check (body is null or char_length(body) <= 4000),
  file_path     text,                                  -- the brokerage's own document, in private storage
  required      boolean not null default true,
  applies_to    text not null default 'everyone' check (applies_to in ('everyone', 'team')),
  position      integer not null default 0,
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  unique (id, workspace_id)
);
create index if not exists packet_items_ws_idx on public.packet_items (workspace_id, position);

create table if not exists public.agent_packet (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces (id) on delete cascade,
  agent_id      uuid not null references public.agents (id) on delete cascade,
  item_id       uuid not null references public.packet_items (id) on delete cascade,
  signed_name   text,
  consent       boolean not null default false,
  upload_path   text,
  done_by       text not null default 'agent',          -- 'agent' or the staff member's name
  done_at       timestamptz not null default now(),
  unique (agent_id, item_id)
);
create index if not exists agent_packet_ws_idx on public.agent_packet (workspace_id, agent_id);

do $$
declare r record;
begin
  for r in select * from (values
      ('packet_items', 'agents.view', 'riders.manage'),
      ('agent_packet', 'agents.view', null)
    ) as t (tbl, read_cap, write_cap) loop
    execute format('alter table public.%I enable row level security', r.tbl);
    execute format('alter table public.%I force row level security', r.tbl);
    execute format('revoke all on table public.%I from anon, authenticated', r.tbl);
    execute format('grant select on table public.%I to authenticated', r.tbl);
    execute format('drop policy if exists "read" on public.%I', r.tbl);
    execute format('drop policy if exists "write" on public.%I', r.tbl);
    execute format('create policy "read" on public.%I for select to authenticated using (private.has_cap(workspace_id, %L))', r.tbl, r.read_cap);
    if r.write_cap is not null then
      execute format('grant insert, update, delete on table public.%I to authenticated', r.tbl);
      execute format('create policy "write" on public.%I for all to authenticated using (private.has_cap(workspace_id, %L)) with check (private.has_cap(workspace_id, %L))', r.tbl, r.write_cap, r.write_cap);
    end if;
    execute format('drop trigger if exists audit_%I on public.%I', r.tbl, r.tbl);
    execute format('create trigger audit_%I after insert or update or delete on public.%I for each row execute function private.audit_row()', r.tbl, r.tbl);
  end loop;
end $$;

drop trigger if exists same_ws on public.agent_packet;
create trigger same_ws before insert or update on public.agent_packet
  for each row execute function private.same_workspace('agent_id', 'agents', 'item_id', 'packet_items');

-- A brokerage's document must live in that brokerage's own folder.
create or replace function private.guard_packet_item()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.file_path is not null and new.file_path not like new.workspace_id::text || '/packet/%' then
    raise exception 'That file does not belong to this brokerage.';
  end if;
  return new;
end;
$$;
drop trigger if exists guard on public.packet_items;
create trigger guard before insert or update on public.packet_items
  for each row execute function private.guard_packet_item();

-- Which items apply to this agent and are still to do.
create or replace function private.packet_outstanding(agent uuid)
returns integer language sql stable security definer set search_path = '' as $$
  select count(*)::integer
    from public.packet_items i
    join public.agents a on a.id = agent and a.workspace_id = i.workspace_id
   where i.active and i.required
     and (i.applies_to = 'everyone' or exists (select 1 from public.team_members tm where tm.agent_id = agent))
     and not exists (select 1 from public.agent_packet p where p.agent_id = agent and p.item_id = i.id);
$$;

-- "Ready" now also means the required paperwork is complete.
create or replace function private.refresh_onboarding(agent uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare a record; ready boolean; flagged boolean; was text;
begin
  select * into a from public.agents where id = agent;
  if not found then return; end if;
  was := a.onboarding_status;
  flagged := a.licence_status in ('mismatch', 'expiring') or a.w9_status = 'name_mismatch';
  ready := a.licence_status = 'verified' and a.w9_status = 'received' and a.rider_status = 'signed'
           and a.details_done_at is not null and private.packet_outstanding(agent) = 0;
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

-- Staff: tick or untick a step that happens outside Kinu (for example direct
-- deposit set up with the payroll provider).
create or replace function public.mark_packet_item(ws uuid, agent uuid, item uuid, is_done boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare i record;
begin
  if not private.has_cap(ws, 'agents.edit') then raise exception 'not allowed' using errcode = '42501'; end if;
  select * into i from public.packet_items where id = item and workspace_id = ws;
  if not found then raise exception 'No such packet item.'; end if;
  if i.kind <> 'outside' then raise exception 'Only the agent can complete this item.'; end if;
  if is_done then
    insert into public.agent_packet (workspace_id, agent_id, item_id, done_by)
    values (ws, agent, item, private.actor_label()) on conflict (agent_id, item_id) do nothing;
  else
    delete from public.agent_packet where agent_id = agent and item_id = item and workspace_id = ws;
  end if;
  perform set_config('kinu.trusted', 'on', true);
  perform private.refresh_onboarding(agent);
  perform set_config('kinu.trusted', 'off', true);
end;
$$;

-- ---------------------------------------------------- portal: the packet --

create or replace function public.portal_packet(token_hash text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare a public.agents;
begin
  a := private.portal_agent(token_hash);
  if a.id is null then return null; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', i.id, 'title', i.title, 'kind', i.kind, 'body', i.body, 'required', i.required,
             'has_file', i.file_path is not null,
             'done', p.id is not null, 'done_at', p.done_at) order by i.position, i.created_at)
      from public.packet_items i
      left join public.agent_packet p on p.item_id = i.id and p.agent_id = a.id
     where i.workspace_id = a.workspace_id and i.active
       and (i.applies_to = 'everyone' or exists (select 1 from public.team_members tm where tm.agent_id = a.id))
  ), '[]'::jsonb);
end;
$$;

-- Where the brokerage's document for an item is stored, for this agent only.
create or replace function public.portal_item_file(token_hash text, item uuid)
returns text language plpgsql stable security definer set search_path = '' as $$
declare a public.agents; path text;
begin
  a := private.portal_agent(token_hash);
  if a.id is null then return null; end if;
  select i.file_path into path from public.packet_items i
   where i.id = item and i.workspace_id = a.workspace_id and i.active;
  return path;
end;
$$;

create or replace function public.portal_complete_item(token_hash text, item uuid, typed_name text, agreed boolean, file_path text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare a public.agents; i record;
begin
  a := private.portal_agent(token_hash);
  if a.id is null then raise exception 'This link has expired. Ask your brokerage for a new one.'; end if;
  select * into i from public.packet_items where id = item and workspace_id = a.workspace_id and active;
  if not found then raise exception 'That item is no longer part of your paperwork.'; end if;

  if i.kind = 'sign' then
    if not coalesce(agreed, false) then raise exception 'Tick the box to agree to sign electronically.'; end if;
    if lower(regexp_replace(trim(coalesce(typed_name, '')), '\s+', ' ', 'g')) <> lower(regexp_replace(a.full_name, '\s+', ' ', 'g')) then
      raise exception 'Type your full name exactly as shown: %', a.full_name; end if;
  elsif i.kind = 'acknowledge' then
    if not coalesce(agreed, false) then raise exception 'Tick the box to confirm you have read it.'; end if;
  elsif i.kind = 'upload' then
    if file_path is null or file_path not like a.workspace_id::text || '/agents/' || a.id::text || '/%' then
      raise exception 'Choose a file to upload.'; end if;
  end if;

  perform set_config('kinu.trusted', 'on', true); perform set_config('kinu.actor', a.full_name || ' (agent)', true);
  insert into public.agent_packet (workspace_id, agent_id, item_id, signed_name, consent, upload_path)
  values (a.workspace_id, a.id, i.id, case when i.kind = 'sign' then trim(typed_name) end, coalesce(agreed, false),
          case when i.kind = 'upload' then file_path end)
  on conflict (agent_id, item_id) do update set signed_name = excluded.signed_name, consent = excluded.consent,
    upload_path = excluded.upload_path, done_at = now();

  if i.kind <> 'outside' then
    insert into public.documents (workspace_id, agent_id, kind, filename, path, status, note)
    values (a.workspace_id, a.id, 'agreement', a.full_name || ' · ' || i.title,
            case when i.kind = 'upload' then file_path end,
            case i.kind when 'sign' then 'signed' when 'acknowledge' then 'acknowledged' else 'on_file' end,
            case i.kind when 'sign' then 'E-signature · consent and time recorded'
                        when 'acknowledge' then 'Read and acknowledged by the agent' else 'Uploaded by the agent' end);
  end if;
  perform private.log(a.workspace_id, i.kind, 'packet', i.id::text,
    case i.kind when 'sign' then 'Signed: ' when 'acknowledge' then 'Acknowledged: ' when 'upload' then 'Uploaded: ' else 'Confirmed done: ' end || i.title);
  perform private.refresh_onboarding(a.id);
end;
$$;

do $$
declare f text;
begin
  execute 'revoke all on function public.mark_packet_item(uuid, uuid, uuid, boolean) from public, anon';
  execute 'grant execute on function public.mark_packet_item(uuid, uuid, uuid, boolean) to authenticated';
  foreach f in array array[
    'public.portal_packet(text)', 'public.portal_item_file(text, uuid)',
    'public.portal_complete_item(text, uuid, text, boolean, text)'] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    if exists (select 1 from pg_roles where rolname = 'service_role') then
      execute format('grant execute on function %s to service_role', f);
    end if;
  end loop;
end $$;
