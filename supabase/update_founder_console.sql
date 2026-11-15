-- Kinu: update for an existing project. Account numbers for every brokerage, the
-- founder console and the founder's filing cabinet (0014).
-- It adds to the database and changes no existing data. Safe to run more than once.

-- Kinu: a permanent account number for every brokerage, the founder's own
-- view and filing cabinet, and the numbers behind the founder dashboard.
-- Safe to run more than once.

-- ---------------------------------------------------- account numbers --
-- Handed out once, in order, never reused and never changed.
create sequence if not exists public.account_no_seq start 100001;
alter table public.workspaces add column if not exists account_no bigint;
do $$
declare w record;
begin
  for w in select id from public.workspaces where account_no is null order by created_at, id loop
    update public.workspaces set account_no = nextval('public.account_no_seq') where id = w.id;
  end loop;
end $$;
alter table public.workspaces alter column account_no set default nextval('public.account_no_seq');
alter table public.workspaces alter column account_no set not null;
create unique index if not exists workspaces_account_no_idx on public.workspaces (account_no);
revoke all on sequence public.account_no_seq from anon, authenticated;

create or replace function private.pin_account_no()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.account_no is distinct from old.account_no then raise exception 'A brokerage''s account number cannot be changed.'; end if;
  return new;
end;
$$;
drop trigger if exists pin_account_no on public.workspaces;
create trigger pin_account_no before update of account_no on public.workspaces
  for each row execute function private.pin_account_no();

-- ------------------------------------------------------------ founder --
-- One member of Kinu staff is the founder (the first one, unless changed
-- here by hand). Other staff get the standard console.
alter table public.platform_admins add column if not exists is_founder boolean not null default false;
update public.platform_admins set is_founder = true
 where user_id = (select user_id from public.platform_admins order by created_at, user_id limit 1)
   and not exists (select 1 from public.platform_admins where is_founder);
create unique index if not exists platform_admins_one_founder on public.platform_admins (is_founder) where is_founder;

create or replace function private.is_founder()
returns boolean language sql stable security definer set search_path = '' as $$
  -- The flagged founder; or, where nobody is flagged yet, the first member of staff.
  select exists (select 1 from public.platform_admins p where p.user_id = (select auth.uid()) and p.is_founder)
      or (not exists (select 1 from public.platform_admins where is_founder)
          and (select auth.uid()) = (select user_id from public.platform_admins order by created_at, user_id limit 1));
$$;
revoke all on function private.is_founder() from public, anon;
grant execute on function private.is_founder() to authenticated;

create or replace function public.console_role()
returns text language sql stable security definer set search_path = '' as $$
  select case when private.is_founder() then 'founder' when private.is_platform_admin() then 'staff' else null end;
$$;
revoke all on function public.console_role() from public, anon;
grant execute on function public.console_role() to authenticated;

-- --------------------------------------------- the founder's filing cabinet --
create table if not exists public.founder_files (
  id          uuid primary key default gen_random_uuid(),
  folder      text not null default 'General' check (char_length(folder) between 1 and 60),
  title       text not null check (char_length(title) between 1 and 160),
  file_path   text not null check (file_path like 'founder/%'),
  file_name   text not null,
  note        text check (note is null or char_length(note) <= 500),
  created_at  timestamptz not null default now()
);
create index if not exists founder_files_folder_idx on public.founder_files (folder, created_at desc);
alter table public.founder_files enable row level security;
alter table public.founder_files force row level security;
revoke all on table public.founder_files from anon, authenticated;
grant select, insert, update, delete on table public.founder_files to authenticated;
drop policy if exists "founder only" on public.founder_files;
create policy "founder only" on public.founder_files for all to authenticated using (private.is_founder()) with check (private.is_founder());

-- Billing files stay open to all Kinu staff; the founder's own folder does not.
drop policy if exists "kinu staff billing files" on storage.objects;
create policy "kinu staff billing files" on storage.objects
  for all to authenticated
  using (bucket_id = 'kinu-billing' and name not like 'founder/%' and private.is_platform_admin())
  with check (bucket_id = 'kinu-billing' and name not like 'founder/%' and private.is_platform_admin());
drop policy if exists "kinu founder files" on storage.objects;
create policy "kinu founder files" on storage.objects
  for all to authenticated
  using (bucket_id = 'kinu-billing' and name like 'founder/%' and private.is_founder())
  with check (bucket_id = 'kinu-billing' and name like 'founder/%' and private.is_founder());

-- ----------------------------------------- the console's search, with numbers --
create or replace function public.platform_brokerages(
  search text default null, only_status text default null, only_billing text default null,
  page_no integer default 1, page_size integer default 24)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare this_month date := date_trunc('month', now())::date; lim integer := least(greatest(coalesce(page_size, 24), 1), 100);
        off integer := (greatest(coalesce(page_no, 1), 1) - 1) * lim; needle text := nullif(trim(coalesce(search, '')), ''); result jsonb;
        digits text := nullif(regexp_replace(coalesce(search, ''), '[^0-9]', '', 'g'), '');
begin
  if not private.is_platform_admin() then raise exception 'not allowed' using errcode = '42501'; end if;
  with base as (
    select w.id, w.account_no, w.name, w.status, w.has_ops, w.has_finance, w.addons, w.created_at, w.plan_name, w.owner_seats, w.agent_seats, w.quoted_monthly,
           case when b.id is null then 'none' when b.proof_path is not null or b.paid_on is not null then 'paid' else 'invoiced' end as billing
      from public.workspaces w
      left join public.billing_months b on b.workspace_id = w.id and b.month = this_month
     where (needle is null or w.name ilike '%' || replace(replace(needle, '%', '\%'), '_', '\_') || '%'
            or (digits is not null and w.account_no::text like '%' || digits || '%'))
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
        'id', p.id, 'account_no', p.account_no, 'name', p.name, 'status', p.status, 'has_ops', p.has_ops, 'has_finance', p.has_finance, 'addons', p.addons,
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

-- ------------------------------------------------ the founder dashboard --
-- Totals only. Nothing from inside a brokerage beyond counts.
create or replace function public.platform_pulse()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare this_month date := date_trunc('month', now())::date; result jsonb;
begin
  if not private.is_platform_admin() then raise exception 'not allowed' using errcode = '42501'; end if;
  select jsonb_build_object(
    'brokerages', (select count(*) from public.workspaces),
    'active', (select count(*) from public.workspaces where status = 'active'),
    'paused', (select count(*) from public.workspaces where status = 'paused'),
    'agents', (select count(*) from public.agents where status <> 'exited'),
    'seats', (select coalesce(sum(agent_seats), 0) from public.workspaces where status = 'active'),
    'staff', (select count(*) from public.workspace_members where status = 'active'),
    'quoted', (select coalesce(sum(quoted_monthly), 0) from public.workspaces where status = 'active'),
    'unquoted', (select count(*) from public.workspaces where status = 'active' and quoted_monthly is null),
    'billed_now', (select coalesce(sum(amount), 0) from public.billing_months where month = this_month),
    'paid_now', (select coalesce(sum(amount), 0) from public.billing_months where month = this_month and (proof_path is not null or paid_on is not null)),
    'open_leads', (select count(*) from public.leads where handled_at is null),
    'months', (select jsonb_agg(jsonb_build_object('month', m.d,
                  'billed', (select coalesce(sum(b.amount), 0) from public.billing_months b where b.month = m.d),
                  'paid', (select coalesce(sum(b.amount), 0) from public.billing_months b where b.month = m.d and (b.proof_path is not null or b.paid_on is not null)),
                  'joined', (select count(*) from public.workspaces w where date_trunc('month', w.created_at)::date = m.d)) order by m.d)
                 from (select (this_month - (n || ' months')::interval)::date as d from generate_series(0, 11) n) m),
    'awaiting', coalesce((select jsonb_agg(x) from (
                  select jsonb_build_object('id', w.id, 'name', w.name, 'account_no', w.account_no, 'month', b.month, 'amount', b.amount) as x
                    from public.billing_months b join public.workspaces w on w.id = b.workspace_id
                   where b.proof_path is null and b.paid_on is null order by b.month, w.name limit 8) q), '[]'::jsonb),
    'ending', coalesce((select jsonb_agg(x) from (
                  select jsonb_build_object('id', w.id, 'name', w.name, 'account_no', w.account_no, 'ends_on', e.ends_on) as x
                    from public.workspaces w join lateral (select max(c.ends_on) as ends_on from public.contracts c where c.workspace_id = w.id) e on true
                   where w.status = 'active' and e.ends_on is not null and e.ends_on <= (now() + interval '60 days')::date order by e.ends_on limit 8) q), '[]'::jsonb),
    'newest', coalesce((select jsonb_agg(x) from (
                  select jsonb_build_object('id', w.id, 'name', w.name, 'account_no', w.account_no, 'created_at', w.created_at, 'plan_name', w.plan_name) as x
                    from public.workspaces w order by w.created_at desc limit 6) q), '[]'::jsonb)
  ) into result;
  return result;
end;
$$;
revoke all on function public.platform_pulse() from public, anon;
grant execute on function public.platform_pulse() to authenticated;
