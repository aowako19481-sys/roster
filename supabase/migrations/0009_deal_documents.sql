-- Kinu: a brokerage's own autofill documents (starting with its deposit
-- record), and a deal's proof of payment and bank receipt.
-- Safe to run more than once.

-- ------------------------------------------------- autofill documents --
-- A brokerage's own documents (its deposit record first of all). A manager
-- writes the layout once and marks where each piece of deal information
-- goes with placeholders such as {{address}}. Kinu fills them in for every
-- deal from the database. Placeholders written {{fill:Label}} become boxes a
-- person types into for that one deal.

create table if not exists public.doc_templates (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references public.workspaces (id) on delete cascade,
  name            text not null check (char_length(name) between 2 and 80),
  purpose         text not null default 'deposit_record' check (purpose in ('deposit_record', 'deal')),
  body            text not null check (char_length(body) between 1 and 20000),
  attach_proof    boolean not null default true,     -- print the proof of payment under it
  attach_receipt  boolean not null default false,    -- offer a bank receipt slot and print it under it
  active          boolean not null default true,
  created_by      uuid references auth.users (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (workspace_id, name),
  unique (id, workspace_id)
);
create index if not exists doc_templates_ws_idx on public.doc_templates (workspace_id, purpose);

-- What a person typed into a document's fill-in boxes for one deal.
create table if not exists public.deal_doc_values (
  deal_id       uuid not null references public.deals (id) on delete cascade,
  template_id   uuid not null references public.doc_templates (id) on delete cascade,
  workspace_id  uuid not null references public.workspaces (id) on delete cascade,
  filled        jsonb not null default '{}',
  updated_at    timestamptz not null default now(),
  primary key (deal_id, template_id)
);

do $$
declare r record;
begin
  -- Only managers (the owner, or whoever runs payroll) may create or change a
  -- brokerage's documents. Anyone who can see deals can use them.
  for r in select * from (values
      ('doc_templates',   'deals.view', 'payroll.manage'),
      ('deal_doc_values', 'deals.view', 'deals.edit')
    ) as t (tbl, read_cap, write_cap) loop
    execute format('alter table public.%I enable row level security', r.tbl);
    execute format('alter table public.%I force row level security', r.tbl);
    execute format('revoke all on table public.%I from anon, authenticated', r.tbl);
    execute format('grant select, insert, update, delete on table public.%I to authenticated', r.tbl);
    execute format('drop policy if exists "read" on public.%I', r.tbl);
    execute format('drop policy if exists "write" on public.%I', r.tbl);
    execute format('create policy "read" on public.%I for select to authenticated using (private.has_cap(workspace_id, %L))', r.tbl, r.read_cap);
    execute format('create policy "write" on public.%I for all to authenticated using (private.has_cap(workspace_id, %L)) with check (private.has_cap(workspace_id, %L))', r.tbl, r.write_cap, r.write_cap);
    execute format('drop trigger if exists audit_%I on public.%I', r.tbl, r.tbl);
    execute format('create trigger audit_%I after insert or update or delete on public.%I for each row execute function private.audit_row()', r.tbl, r.tbl);
  end loop;
end $$;

drop trigger if exists same_ws on public.deal_doc_values;
create trigger same_ws before insert or update on public.deal_doc_values
  for each row execute function private.same_workspace('deal_id', 'deals', 'template_id', 'doc_templates');

-- A bank receipt is its own kind of file.
alter table public.documents drop constraint if exists documents_kind_check;
alter table public.documents add constraint documents_kind_check
  check (kind in ('licence', 'w9', 'rider', 'agreement', 'audit_export', 'payment_proof', 'bank_receipt'));
create index if not exists documents_deal_idx on public.documents (deal_id) where deal_id is not null;

-- Attach a stored file to a deal as proof of payment or as the bank receipt.
-- Finance staff who record payments may do this; the file must be in their
-- own brokerage's payments folder.
create or replace function public.attach_deal_document(ws uuid, deal uuid, doc_kind text, file_path text, file_name text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare out_id uuid; addr text;
begin
  if not private.has_cap(ws, 'payments.manage') then raise exception 'You are not allowed to add payment documents.' using errcode = '42501'; end if;
  if doc_kind not in ('payment_proof', 'bank_receipt') then raise exception 'unknown document type'; end if;
  select d.address into addr from public.deals d where d.id = deal and d.workspace_id = ws;
  if addr is null then raise exception 'No such deal.'; end if;
  if file_path is null or file_path not like ws::text || '/payments/%' then raise exception 'That file does not belong to this brokerage.'; end if;
  insert into public.documents (workspace_id, deal_id, kind, filename, path, status, note)
  values (ws, deal, doc_kind, left(coalesce(nullif(trim(file_name), ''), 'file'), 200), file_path, 'on_file',
          case doc_kind when 'bank_receipt' then 'Bank receipt · ' else 'Proof of payment · ' end || addr)
  returning id into out_id;
  return out_id;
end;
$$;

create or replace function public.remove_deal_document(ws uuid, doc uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare d record; st text;
begin
  if not private.has_cap(ws, 'payments.manage') then raise exception 'You are not allowed to remove payment documents.' using errcode = '42501'; end if;
  select * into d from public.documents where id = doc and workspace_id = ws and kind in ('payment_proof', 'bank_receipt') and deal_id is not null;
  if not found then raise exception 'No such document.'; end if;
  select status into st from public.deals where id = d.deal_id;
  if st in ('processed', 'closed') then raise exception 'This deal is in a payroll, so its documents can no longer be removed.'; end if;
  delete from public.documents where id = doc;
  return d.path;
end;
$$;

do $$
declare f text;
begin
  foreach f in array array['public.attach_deal_document(uuid, uuid, text, text, text)', 'public.remove_deal_document(uuid, uuid)'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

-- Deal documents can be read by anyone who may see deals (they are part of
-- the deal), not only by roles with the general files permission.
drop policy if exists "read deal documents" on public.documents;
create policy "read deal documents" on public.documents
  for select to authenticated
  using (deal_id is not null and kind in ('payment_proof', 'bank_receipt') and private.has_cap(workspace_id, 'deals.view'));
