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
