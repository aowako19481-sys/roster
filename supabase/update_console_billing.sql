-- Kinu: update for an existing project. The website inbox (0011), the staff console's
-- billing files, seats and search (0012), and each brokerage's own deal checklist (0013),
-- joined for one paste. It adds to the database and changes no existing data.
-- Safe to run more than once.

-- Kinu: messages from the public website's "Get started" form.
-- Safe to run more than once.
--
-- Nobody outside can read or write this table. The website's server hands a
-- message to submit_lead(), which checks it and limits how many can arrive.
-- Only Kinu staff can read the inbox.

create table if not exists public.leads (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  name        text not null check (char_length(name) between 2 and 120),
  company     text not null check (char_length(company) between 2 and 160),
  email       text not null check (char_length(email) between 5 and 254),
  agents      text not null default '',
  plan        text not null default '',
  message     text not null default '' check (char_length(message) <= 2000),
  sender_key  text not null,                    -- a one-way fingerprint of the sender's address, for limits only
  handled_at  timestamptz,
  handled_by  text
);
create index if not exists leads_recent_idx on public.leads (created_at desc);
create index if not exists leads_sender_idx on public.leads (sender_key, created_at);

alter table public.leads enable row level security;
alter table public.leads force row level security;
revoke all on table public.leads from anon, authenticated;
grant select on table public.leads to authenticated;
drop policy if exists "staff read" on public.leads;
create policy "staff read" on public.leads for select to authenticated using (private.is_platform_admin());

create or replace function public.submit_lead(
  lead_name text, lead_company text, lead_email text, lead_agents text, lead_plan text, lead_message text, sender text)
returns text language plpgsql security definer set search_path = '' as $$
declare clean_email text := lower(trim(coalesce(lead_email, '')));
begin
  if char_length(trim(coalesce(lead_name, ''))) < 2 then return 'name'; end if;
  if char_length(trim(coalesce(lead_company, ''))) < 2 then return 'company'; end if;
  if clean_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or char_length(clean_email) > 254 then return 'email'; end if;
  if coalesce(sender, '') = '' then return 'busy'; end if;
  -- Limits: a handful per sender per hour, and a ceiling for the whole site per day.
  if (select count(*) from public.leads l where l.sender_key = sender and l.created_at > now() - interval '1 hour') >= 3 then return 'busy'; end if;
  if (select count(*) from public.leads l where l.created_at > now() - interval '1 day') >= 300 then return 'busy'; end if;
  insert into public.leads (name, company, email, agents, plan, message, sender_key)
  values (left(trim(lead_name), 120), left(trim(lead_company), 160), clean_email, left(coalesce(lead_agents, ''), 40),
          left(coalesce(lead_plan, ''), 200), left(coalesce(lead_message, ''), 2000), left(sender, 64));
  return 'ok';
end;
$$;

-- Staff: mark a message as dealt with, or put it back.
create or replace function public.handle_lead(lead uuid, is_handled boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_platform_admin() then raise exception 'not allowed' using errcode = '42501'; end if;
  update public.leads set handled_at = case when is_handled then now() end,
         handled_by = case when is_handled then private.actor_label() end where id = lead;
end;
$$;

do $$
begin
  execute 'revoke all on function public.submit_lead(text, text, text, text, text, text, text) from public, anon, authenticated';
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.submit_lead(text, text, text, text, text, text, text) to service_role';
  end if;
  execute 'revoke all on function public.handle_lead(uuid, boolean) from public, anon';
  execute 'grant execute on function public.handle_lead(uuid, boolean) to authenticated';
end $$;
-- Kinu: each brokerage's account file for Kinu staff. Plan, seats, the
-- invoice and proof of payment filed every month, and contracts filed every
-- year. Also a search for the console that scales to thousands of brokerages.
-- Safe to run more than once.
--
-- Everything here is for Kinu staff only. A brokerage's own people cannot
-- read these tables or files, whatever their role.

-- ------------------------------------------------------- plan and seats --
alter table public.workspaces add column if not exists plan_name text not null default 'standard'
  check (plan_name in ('standard', 'team', 'brokerage', 'custom'));
alter table public.workspaces add column if not exists owner_seats integer not null default 1 check (owner_seats between 1 and 100);
alter table public.workspaces add column if not exists agent_seats integer check (agent_seats is null or agent_seats between 1 and 1000000);
alter table public.workspaces add column if not exists quoted_monthly numeric(10, 2) check (quoted_monthly is null or quoted_monthly >= 0);

-- Owner / Admin seats: a brokerage can only have as many as its plan
-- includes. Kinu staff raise the number when the brokerage buys more.
create or replace function private.check_owner_seats()
returns trigger language plpgsql security definer set search_path = '' as $$
declare seats integer; used integer; mail text;
begin
  if new.role is distinct from 'owner_admin' then return new; end if;
  if tg_table_name = 'workspace_members' then
    if new.status is distinct from 'active' then return new; end if;
    if tg_op = 'UPDATE' and old.role = 'owner_admin' and old.status = 'active' then return new; end if;
    -- Kinu staff who sit in a brokerage to help do not use up its seats.
    if exists (select 1 from public.platform_admins p where p.user_id = new.user_id) then return new; end if;
    mail := lower(coalesce(new.email, ''));
  else
    if new.accepted_at is not null then return new; end if;
    if tg_op = 'UPDATE' and old.role = 'owner_admin' then return new; end if;
    mail := lower(new.email);
  end if;
  select w.owner_seats into seats from public.workspaces w where w.id = new.workspace_id;
  select (select count(*) from public.workspace_members m
           where m.workspace_id = new.workspace_id and m.role = 'owner_admin' and m.status = 'active'
             and lower(coalesce(m.email, '')) <> mail
             and not exists (select 1 from public.platform_admins p where p.user_id = m.user_id))
       + (select count(*) from public.member_invites i
           where i.workspace_id = new.workspace_id and i.role = 'owner_admin' and i.accepted_at is null and i.email <> mail)
    into used;
  if used >= coalesce(seats, 1) then
    raise exception 'This brokerage''s plan includes % Owner / Admin seat%. Contact Kinu to add another.', coalesce(seats, 1), case when coalesce(seats, 1) = 1 then '' else 's' end;
  end if;
  return new;
end;
$$;
drop trigger if exists owner_seats on public.workspace_members;
create trigger owner_seats before insert or update of role, status on public.workspace_members
  for each row execute function private.check_owner_seats();
drop trigger if exists owner_seats on public.member_invites;
create trigger owner_seats before insert or update of role on public.member_invites
  for each row execute function private.check_owner_seats();

create or replace function public.platform_set_account(
  ws uuid, new_plan text, new_owner_seats integer, new_agent_seats integer, new_quote numeric)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_platform_admin() then raise exception 'not allowed' using errcode = '42501'; end if;
  if new_plan not in ('standard', 'team', 'brokerage', 'custom') then raise exception 'Choose a plan from the list.'; end if;
  if new_owner_seats is null or new_owner_seats not between 1 and 100 then raise exception 'Owner / Admin seats must be between 1 and 100.'; end if;
  update public.workspaces set plan_name = new_plan, owner_seats = new_owner_seats,
         agent_seats = new_agent_seats, quoted_monthly = new_quote where id = ws;
  if not found then raise exception 'That brokerage could not be found.'; end if;
end;
$$;

-- ------------------------------------------------- billing, month by month --
create table if not exists public.billing_months (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces (id) on delete cascade,
  month         date not null check (extract(day from month) = 1),
  amount        numeric(10, 2) check (amount is null or amount >= 0),
  invoice_no    text check (invoice_no is null or char_length(invoice_no) <= 60),
  invoice_path  text,
  invoice_name  text,
  proof_path    text,
  proof_name    text,
  payment_ref   text check (payment_ref is null or char_length(payment_ref) <= 80),
  paid_on       date,
  note          text check (note is null or char_length(note) <= 500),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  updated_by    text,
  unique (workspace_id, month)
);
create index if not exists billing_months_recent_idx on public.billing_months (month desc);

-- ------------------------------------------------------ contracts, by year --
create table if not exists public.contracts (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces (id) on delete cascade,
  title         text not null default 'Service agreement' check (char_length(title) between 2 and 120),
  starts_on     date not null,
  ends_on       date not null check (ends_on >= starts_on),
  file_path     text not null,
  file_name     text not null,
  note          text check (note is null or char_length(note) <= 500),
  created_at    timestamptz not null default now(),
  created_by    text
);
create index if not exists contracts_ws_idx on public.contracts (workspace_id, starts_on desc);

-- A filed document must sit in that brokerage's own folder.
create or replace function private.guard_billing_path()
returns trigger language plpgsql security definer set search_path = '' as $$
declare mine text := new.workspace_id::text || '/%';
begin
  if tg_table_name = 'contracts' then
    if new.file_path not like mine then raise exception 'That file is filed under a different brokerage.'; end if;
  else
    if (new.invoice_path is not null and new.invoice_path not like mine) or (new.proof_path is not null and new.proof_path not like mine) then
      raise exception 'That file is filed under a different brokerage.';
    end if;
  end if;
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['billing_months', 'contracts'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('revoke all on table public.%I from anon, authenticated', t);
    execute format('grant select, insert, update, delete on table public.%I to authenticated', t);
    execute format('drop policy if exists "staff only" on public.%I', t);
    execute format('create policy "staff only" on public.%I for all to authenticated using (private.is_platform_admin()) with check (private.is_platform_admin())', t);
    execute format('drop trigger if exists guard on public.%I', t);
    execute format('create trigger guard before insert or update on public.%I for each row execute function private.guard_billing_path()', t);
  end loop;
end $$;

-- A private place for these files, separate from brokerages' own documents.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('kinu-billing', 'kinu-billing', false, 10485760, array['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
drop policy if exists "kinu staff billing files" on storage.objects;
create policy "kinu staff billing files" on storage.objects
  for all to authenticated
  using (bucket_id = 'kinu-billing' and private.is_platform_admin())
  with check (bucket_id = 'kinu-billing' and private.is_platform_admin());

-- ------------------------------------------------- the console's search --
create or replace function public.platform_brokerages(
  search text default null, only_status text default null, only_billing text default null,
  page_no integer default 1, page_size integer default 24)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare this_month date := date_trunc('month', now())::date; lim integer := least(greatest(coalesce(page_size, 24), 1), 100);
        off integer := (greatest(coalesce(page_no, 1), 1) - 1) * lim; needle text := nullif(trim(coalesce(search, '')), ''); result jsonb;
begin
  if not private.is_platform_admin() then raise exception 'not allowed' using errcode = '42501'; end if;
  with base as (
    select w.id, w.name, w.status, w.has_ops, w.has_finance, w.addons, w.created_at, w.plan_name, w.owner_seats, w.agent_seats, w.quoted_monthly,
           case when b.id is null then 'none' when b.proof_path is not null or b.paid_on is not null then 'paid' else 'invoiced' end as billing
      from public.workspaces w
      left join public.billing_months b on b.workspace_id = w.id and b.month = this_month
     where (needle is null or w.name ilike '%' || replace(replace(needle, '%', '\%'), '_', '\_') || '%')
       and (only_status is null or w.status = only_status)
  ), filtered as (
    select * from base where only_billing is null or billing = only_billing
  ), page as (
    select * from filtered order by name, created_at limit lim offset off
  )
  select jsonb_build_object(
    'total', (select count(*) from filtered),
    'all', (select count(*) from public.workspaces),
    'unpaid', (select count(*) from base where billing <> 'paid' and status = 'active'),
    'rows', coalesce((select jsonb_agg(jsonb_build_object(
        'id', p.id, 'name', p.name, 'status', p.status, 'has_ops', p.has_ops, 'has_finance', p.has_finance, 'addons', p.addons,
        'created_at', p.created_at, 'plan_name', p.plan_name, 'owner_seats', p.owner_seats, 'agent_seats', p.agent_seats,
        'quoted_monthly', p.quoted_monthly, 'billing', p.billing,
        'agents', (select count(*) from public.agents a where a.workspace_id = p.id and a.status <> 'exited'),
        'offices', (select count(*) from public.offices o where o.workspace_id = p.id),
        'members', (select count(*) from public.workspace_members m where m.workspace_id = p.id and m.status = 'active'),
        'owners', (select count(*) from public.workspace_members m where m.workspace_id = p.id and m.status = 'active' and m.role = 'owner_admin'
                     and not exists (select 1 from public.platform_admins pa where pa.user_id = m.user_id)),
        'contract_ends', (select max(c.ends_on) from public.contracts c where c.workspace_id = p.id)
      ) order by p.name, p.created_at) from page p), '[]'::jsonb))
    into result;
  return result;
end;
$$;

do $$
begin
  execute 'revoke all on function public.platform_set_account(uuid, text, integer, integer, numeric) from public, anon';
  execute 'grant execute on function public.platform_set_account(uuid, text, integer, integer, numeric) to authenticated';
  execute 'revoke all on function public.platform_brokerages(text, text, text, integer, integer) from public, anon';
  execute 'grant execute on function public.platform_brokerages(text, text, text, integer, integer) to authenticated';
end $$;
-- Kinu: each brokerage's own deal checklist, and the name of the transaction
-- system it uses (Dotloop, SkySlope, a shared drive, or none).
-- Safe to run more than once.

alter table public.workspaces add column if not exists deal_system text not null default ''
  check (char_length(deal_system) <= 40);

-- The boxes every new deal starts with. A manager sets these once.
create table if not exists public.checklist_items (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces (id) on delete cascade,
  label         text not null check (char_length(label) between 1 and 120),
  position      integer not null default 0,
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  unique (workspace_id, label)
);
create index if not exists checklist_items_ws_idx on public.checklist_items (workspace_id, position);

alter table public.checklist_items enable row level security;
alter table public.checklist_items force row level security;
revoke all on table public.checklist_items from anon, authenticated;
grant select, insert, update, delete on table public.checklist_items to authenticated;
drop policy if exists "read" on public.checklist_items;
create policy "read" on public.checklist_items for select to authenticated using (private.has_cap(workspace_id, 'deals.view'));
drop policy if exists "write" on public.checklist_items;
create policy "write" on public.checklist_items for all to authenticated
  using (private.has_cap(workspace_id, 'payroll.manage')) with check (private.has_cap(workspace_id, 'payroll.manage'));
drop trigger if exists audit_checklist_items on public.checklist_items;
create trigger audit_checklist_items after insert or update or delete on public.checklist_items
  for each row execute function private.audit_row();

-- Managers: name the system the brokerage keeps its deal files in.
create or replace function public.set_deal_system(ws uuid, system_name text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not private.has_cap(ws, 'payroll.manage') then raise exception 'not allowed' using errcode = '42501'; end if;
  update public.workspaces set deal_system = left(trim(coalesce(system_name, '')), 40) where id = ws;
end;
$$;
revoke all on function public.set_deal_system(uuid, text) from public, anon;
grant execute on function public.set_deal_system(uuid, text) to authenticated;
