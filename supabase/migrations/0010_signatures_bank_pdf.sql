-- Kinu: a signature record for everything signed, direct deposit
-- authorisation without bank numbers, and a brokerage's own PDF forms as
-- autofill documents.
-- Safe to run more than once.

-- ------------------------------------------------------- signature record --
-- One row per signature or acknowledgement: who, when, from where, the exact
-- words they agreed to, and a fingerprint (SHA-256) of exactly what was
-- signed. Rows can be added and read; they can never be changed.

create table if not exists public.signatures (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces (id) on delete cascade,
  agent_id      uuid not null references public.agents (id) on delete cascade,
  subject       text not null check (subject in ('rider', 'packet', 'direct_deposit')),
  subject_id    uuid,
  title         text not null,
  method        text not null check (method in ('typed_name', 'acknowledgement')),
  doc_text      text not null,                 -- the exact wording put in front of the signer
  doc_sha256    text not null,                 -- fingerprint of doc_text
  file_path     text,                          -- the brokerage's own document, if there was one
  file_sha256   text,                          -- fingerprint of that file at the moment of signing
  signer_name   text not null,
  signer_email  text,
  consent_text  text not null,                 -- the electronic-signature disclosure they agreed to
  ip_address    text,
  user_agent    text,
  signed_at     timestamptz not null default now(),
  seal          text not null                  -- fingerprint of the whole record
);
create index if not exists signatures_agent_idx on public.signatures (workspace_id, agent_id, signed_at);

alter table public.signatures enable row level security;
alter table public.signatures force row level security;
revoke all on table public.signatures from anon, authenticated;
grant select on table public.signatures to authenticated;
drop policy if exists "read" on public.signatures;
create policy "read" on public.signatures for select to authenticated using (private.has_cap(workspace_id, 'agents.view'));

create or replace function private.guard_signature()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then raise exception 'A signature record cannot be changed.'; end if;
  -- A record only goes when its whole brokerage or agent is removed.
  if exists (select 1 from public.agents a where a.id = old.agent_id) then
    raise exception 'A signature record cannot be deleted.';
  end if;
  return old;
end;
$$;
drop trigger if exists guard on public.signatures;
create trigger guard before update or delete on public.signatures
  for each row execute function private.guard_signature();

create or replace function private.sha256_hex(t text)
returns text language sql immutable set search_path = '' as $$
  select encode(sha256(convert_to(coalesce(t, ''), 'UTF8')), 'hex');
$$;

create or replace function private.record_signature(
  a public.agents, subj text, subj_id uuid, doc_title text, how text, body text,
  f_path text, f_hash text, typed text, consent_words text, ip text, agent_string text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare sig uuid := gen_random_uuid(); at timestamptz := now(); doc_hash text;
begin
  if coalesce(trim(consent_words), '') = '' then raise exception 'The signing disclosure is missing.'; end if;
  doc_hash := private.sha256_hex(body);
  insert into public.signatures (id, workspace_id, agent_id, subject, subject_id, title, method, doc_text, doc_sha256,
    file_path, file_sha256, signer_name, signer_email, consent_text, ip_address, user_agent, signed_at, seal)
  values (sig, a.workspace_id, a.id, subj, subj_id, doc_title, how, body, doc_hash,
    f_path, nullif(f_hash, ''), trim(typed), a.email, consent_words, left(nullif(ip, ''), 60), left(nullif(agent_string, ''), 300), at,
    private.sha256_hex(concat_ws('|', sig::text, a.id::text, subj, coalesce(subj_id::text, ''), doc_hash, coalesce(f_hash, ''),
      trim(typed), coalesce(a.email, ''), private.sha256_hex(consent_words), coalesce(ip, ''), to_char(at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'))));
  return sig;
end;
$$;

-- The rider written out in words, so the exact terms are kept with the signature.
create or replace function private.rider_text(r public.riders, a public.agents, brokerage text)
returns text language plpgsql stable security definer set search_path = '' as $$
declare t jsonb; body text;
begin
  body := format(E'Commission rider, version %s\nBrokerage: %s\nAgent: %s\n\nThe agent''s commission split is %s%% of the net commission on each deal.',
    r.version, brokerage, a.full_name, trim(to_char(r.split_pct, 'FM990.##'), '.'));
  if jsonb_typeof(r.tiers) = 'array' and jsonb_array_length(r.tiers) > 0 then
    body := body || E'\n\nCommission tiers (commission earned this year):';
    for t in select * from jsonb_array_elements(r.tiers) loop
      body := body || format(E'\n- $%s %s: %s%%', to_char((t->>'from')::numeric, 'FM999,999,990'),
        case when t->>'to' is null then 'and above' else 'to $' || to_char((t->>'to')::numeric, 'FM999,999,990') end, t->>'pct');
    end loop;
    body := body || E'\n\nMoving to a higher tier is never automatic: the brokerage approves it and the agent signs an updated rider.';
  end if;
  return body;
end;
$$;

-- ------------------------------------------------- direct deposit record --
-- Kinu never holds a full account or routing number. It keeps the bank's
-- name, the kind of account, the last four digits and the signed
-- authorisation. The full numbers go to the bank or payout provider.

create table if not exists public.agent_bank (
  agent_id      uuid primary key references public.agents (id) on delete cascade,
  workspace_id  uuid not null references public.workspaces (id) on delete cascade,
  bank_name     text not null check (char_length(bank_name) between 2 and 80),
  account_type  text not null check (account_type in ('checking', 'savings')),
  last4         text not null check (last4 ~ '^[0-9]{4}$'),
  signature_id  uuid references public.signatures (id) on delete set null,
  updated_at    timestamptz not null default now()
);
alter table public.agent_bank enable row level security;
alter table public.agent_bank force row level security;
revoke all on table public.agent_bank from anon, authenticated;
grant select on table public.agent_bank to authenticated;
drop policy if exists "read" on public.agent_bank;
create policy "read" on public.agent_bank for select to authenticated using (private.has_cap(workspace_id, 'agents.view'));

alter table public.packet_items drop constraint if exists packet_items_kind_check;
alter table public.packet_items add constraint packet_items_kind_check
  check (kind in ('sign', 'acknowledge', 'upload', 'outside', 'bank'));

-- --------------------------------------------------- portal: signing again --

drop function if exists public.portal_sign_rider(text, text, boolean, text);
create or replace function public.portal_sign_rider(
  token_hash text, typed_name text, consent boolean, signer_note text default null,
  consent_text text default null, ip text default null, agent_string text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare a public.agents; r public.riders; sig uuid; brokerage text;
begin
  a := private.portal_agent(token_hash);
  if a.id is null then raise exception 'This link has expired. Ask your brokerage for a new one.'; end if;
  if not coalesce(consent, false) then raise exception 'Tick the box to agree to sign electronically.'; end if;
  if lower(regexp_replace(trim(coalesce(typed_name, '')), '\s+', ' ', 'g')) <> lower(regexp_replace(a.full_name, '\s+', ' ', 'g')) then
    raise exception 'Type your full name exactly as shown: %', a.full_name; end if;
  select * into r from public.riders rd where rd.agent_id = a.id and rd.status = 'sent' order by rd.version desc limit 1;
  if not found then raise exception 'There is no rider waiting for your signature.'; end if;
  select w.name into brokerage from public.workspaces w where w.id = a.workspace_id;
  perform set_config('kinu.trusted', 'on', true); perform set_config('kinu.actor', a.full_name || ' (agent)', true);
  sig := private.record_signature(a, 'rider', r.id, format('Commission rider v%s', r.version), 'typed_name',
    private.rider_text(r, a, brokerage), null, null, typed_name, consent_text, ip, agent_string);
  update public.riders set is_current = false, status = 'superseded' where agent_id = a.id and is_current;
  update public.riders set status = 'signed', is_current = true, signed_at = now(), signed_name = trim(typed_name),
         signed_consent = true, signature_note = coalesce(signer_note, 'E-signature') where id = r.id;
  update public.agents set rider_status = 'signed' where id = a.id;
  insert into public.documents (workspace_id, agent_id, kind, filename, status, note)
  values (a.workspace_id, a.id, 'rider', format('%s · individual rider v%s', a.full_name, r.version), 'signed', 'E-signature · signature record kept');
  perform private.log(a.workspace_id, 'sign', 'riders', r.id::text,
    format('Individual rider v%s signed at %s%%', r.version, trim(to_char(r.split_pct, 'FM990.##'), '.')));
  perform private.refresh_onboarding(a.id);
end;
$$;

drop function if exists public.portal_complete_item(text, uuid, text, boolean, text);
create or replace function public.portal_complete_item(
  token_hash text, item uuid, typed_name text, agreed boolean, file_path text default null,
  consent_text text default null, ip text default null, agent_string text default null, file_hash text default null,
  bank text default null, bank_type text default null, bank_last4 text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare a public.agents; i record; sig uuid; words text; name_ok boolean;
begin
  a := private.portal_agent(token_hash);
  if a.id is null then raise exception 'This link has expired. Ask your brokerage for a new one.'; end if;
  select * into i from public.packet_items where id = item and workspace_id = a.workspace_id and active;
  if not found then raise exception 'That item is no longer part of your paperwork.'; end if;
  if i.file_path is not null and i.kind in ('sign', 'acknowledge', 'bank') and coalesce(file_hash, '') = '' then
    raise exception 'We could not read the document. Please try again.'; end if;
  name_ok := lower(regexp_replace(trim(coalesce(typed_name, '')), '\s+', ' ', 'g')) = lower(regexp_replace(a.full_name, '\s+', ' ', 'g'));

  if i.kind in ('sign', 'bank') then
    if not coalesce(agreed, false) then raise exception 'Tick the box to agree to sign electronically.'; end if;
    if not name_ok then raise exception 'Type your full name exactly as shown: %', a.full_name; end if;
  elsif i.kind = 'acknowledge' then
    if not coalesce(agreed, false) then raise exception 'Tick the box to confirm you have read it.'; end if;
  elsif i.kind = 'upload' then
    if file_path is null or file_path not like a.workspace_id::text || '/agents/' || a.id::text || '/%' then
      raise exception 'Choose a file to upload.'; end if;
  end if;
  if i.kind = 'bank' then
    if char_length(trim(coalesce(bank, ''))) < 2 then raise exception 'Enter the name of your bank.'; end if;
    if coalesce(bank_type, '') not in ('checking', 'savings') then raise exception 'Choose checking or savings.'; end if;
    if coalesce(bank_last4, '') !~ '^[0-9]{4}$' then raise exception 'Enter only the last four digits of the account number.'; end if;
  end if;

  perform set_config('kinu.trusted', 'on', true); perform set_config('kinu.actor', a.full_name || ' (agent)', true);

  words := i.title || coalesce(E'\n\n' || i.body, '');
  if i.kind = 'bank' then
    words := words || format(E'\n\nAccount to be paid into: %s, %s account ending %s.', trim(bank), bank_type, bank_last4);
  end if;
  if i.kind in ('sign', 'bank') then
    sig := private.record_signature(a, case when i.kind = 'bank' then 'direct_deposit' else 'packet' end, i.id, i.title,
      'typed_name', words, i.file_path, file_hash, typed_name, consent_text, ip, agent_string);
  elsif i.kind = 'acknowledge' then
    sig := private.record_signature(a, 'packet', i.id, i.title, 'acknowledgement', words, i.file_path, file_hash,
      a.full_name, coalesce(consent_text, 'I have read and understood this.'), ip, agent_string);
  end if;
  if i.kind = 'bank' then
    insert into public.agent_bank (agent_id, workspace_id, bank_name, account_type, last4, signature_id)
    values (a.id, a.workspace_id, trim(bank), bank_type, bank_last4, sig)
    on conflict (agent_id) do update set bank_name = excluded.bank_name, account_type = excluded.account_type,
      last4 = excluded.last4, signature_id = excluded.signature_id, updated_at = now();
  end if;

  insert into public.agent_packet (workspace_id, agent_id, item_id, signed_name, consent, upload_path)
  values (a.workspace_id, a.id, i.id, case when i.kind in ('sign', 'bank') then trim(typed_name) end, coalesce(agreed, false),
          case when i.kind = 'upload' then file_path end)
  on conflict (agent_id, item_id) do update set signed_name = excluded.signed_name, consent = excluded.consent,
    upload_path = excluded.upload_path, done_at = now();

  if i.kind <> 'outside' then
    insert into public.documents (workspace_id, agent_id, kind, filename, path, status, note)
    values (a.workspace_id, a.id, 'agreement', a.full_name || ' · ' || i.title,
            case when i.kind = 'upload' then file_path end,
            case when i.kind in ('sign', 'bank') then 'signed' when i.kind = 'acknowledge' then 'acknowledged' else 'on_file' end,
            case when i.kind in ('sign', 'bank') then 'E-signature · signature record kept'
                 when i.kind = 'acknowledge' then 'Read and acknowledged by the agent · record kept' else 'Uploaded by the agent' end);
  end if;
  perform private.log(a.workspace_id, i.kind, 'packet', i.id::text,
    case i.kind when 'sign' then 'Signed: ' when 'bank' then 'Direct deposit authorised: ' when 'acknowledge' then 'Acknowledged: '
                when 'upload' then 'Uploaded: ' else 'Confirmed done: ' end || i.title);
  perform private.refresh_onboarding(a.id);
end;
$$;

-- The agent's own signature records, so they can keep a copy.
create or replace function public.portal_signatures(token_hash text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare a public.agents;
begin
  a := private.portal_agent(token_hash);
  if a.id is null then return null; end if;
  return coalesce((
    select jsonb_agg(to_jsonb(s) || jsonb_build_object('brokerage', (select w.name from public.workspaces w where w.id = s.workspace_id)) order by s.signed_at)
      from public.signatures s where s.agent_id = a.id), '[]'::jsonb);
end;
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'public.portal_sign_rider(text, text, boolean, text, text, text, text)',
    'public.portal_complete_item(text, uuid, text, boolean, text, text, text, text, text, text, text, text)',
    'public.portal_signatures(text)'] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    if exists (select 1 from pg_roles where rolname = 'service_role') then
      execute format('grant execute on function %s to service_role', f);
    end if;
  end loop;
end $$;

-- ------------------------------------- a brokerage's own PDF as a document --
-- A manager uploads a PDF that has form fields. Kinu lists the fields and
-- the manager says what goes in each one.

alter table public.doc_templates add column if not exists file_path text;
alter table public.doc_templates add column if not exists fields jsonb not null default '[]';
alter table public.doc_templates add column if not exists field_map jsonb not null default '{}';

create or replace function private.guard_doc_template()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.file_path is not null and new.file_path not like new.workspace_id::text || '/templates/%' then
    raise exception 'That file does not belong to this brokerage.';
  end if;
  if tg_op = 'UPDATE' and new.workspace_id is distinct from old.workspace_id then
    raise exception 'A document cannot move to another brokerage.';
  end if;
  return new;
end;
$$;
drop trigger if exists guard on public.doc_templates;
create trigger guard before insert or update on public.doc_templates
  for each row execute function private.guard_doc_template();

drop policy if exists "kinu managers add templates" on storage.objects;
create policy "kinu managers add templates" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'documents' and name like '%/templates/%' and private.has_cap(private.path_workspace(name), 'payroll.manage'));
drop policy if exists "kinu managers remove templates" on storage.objects;
create policy "kinu managers remove templates" on storage.objects
  for delete to authenticated
  using (bucket_id = 'documents' and name like '%/templates/%' and private.has_cap(private.path_workspace(name), 'payroll.manage'));
drop policy if exists "kinu read templates" on storage.objects;
create policy "kinu read templates" on storage.objects
  for select to authenticated
  using (bucket_id = 'documents' and name like '%/templates/%' and private.has_cap(private.path_workspace(name), 'deals.view'));
