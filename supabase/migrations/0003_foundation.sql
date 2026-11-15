-- Kinu foundation: platform admins, brokerages, roles and permissions,
-- offices, custom roles, invitations, audit log, private file storage.
-- Safe to run more than once.
--
-- Security model:
--   * Every table has row-level security enabled and forced.
--   * What a person can do is decided here, in the database, from their role.
--     The app asks; it never decides.
--   * Every change to business data is written to the audit log by a trigger,
--     so it cannot be skipped by calling the API directly.
--   * "Big powers" (override, release payroll) belong to the owner, or to
--     people the owner has explicitly granted them to.

-- ------------------------------------------------------------- platform --

create table if not exists public.platform_admins (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now()
);

create or replace function private.is_platform_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.platform_admins p where p.user_id = (select auth.uid()));
$$;

-- ----------------------------------------------------------- brokerages --

alter table public.workspaces
  add column if not exists has_ops            boolean not null default true,
  add column if not exists has_finance        boolean not null default true,
  add column if not exists addons             text[]  not null default array['retention','finance_shield','compliance'],
  add column if not exists status             text    not null default 'active',
  add column if not exists seats              integer not null default 0,
  add column if not exists payroll_weekdays   integer[] not null default array[1,4],   -- 1 = Monday ... 7 = Sunday
  add column if not exists cutoff_time        time    not null default '08:30',
  add column if not exists close_time         time    not null default '18:00',
  add column if not exists max_teams_per_agent integer not null default 1,
  add column if not exists reply_alias        text,
  add column if not exists created_by         uuid references auth.users (id) on delete set null;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'workspaces_status_check') then
    alter table public.workspaces add constraint workspaces_status_check check (status in ('active', 'paused', 'closed'));
  end if;
end $$;

create table if not exists public.offices (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces (id) on delete cascade,
  name          text not null check (char_length(name) between 1 and 80),
  unique (workspace_id, name),
  unique (id, workspace_id)
);

create table if not exists public.custom_roles (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces (id) on delete cascade,
  name          text not null check (char_length(name) between 1 and 60),
  caps          text[] not null default '{}',
  office_id     uuid references public.offices (id) on delete set null,
  created_at    timestamptz not null default now(),
  unique (workspace_id, name),
  unique (id, workspace_id)
);

alter table public.workspace_members
  add column if not exists status              text not null default 'active',
  add column if not exists office_id           uuid references public.offices (id) on delete set null,
  add column if not exists custom_role_id      uuid references public.custom_roles (id) on delete set null,
  add column if not exists can_override        boolean not null default false,
  add column if not exists can_release_payroll boolean not null default false,
  add column if not exists email               text;

create table if not exists public.member_invites (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces (id) on delete cascade,
  email         text not null check (email = lower(email) and char_length(email) between 3 and 254),
  role          text not null,
  office_id     uuid references public.offices (id) on delete set null,
  invited_by    uuid references auth.users (id) on delete set null,
  created_at    timestamptz not null default now(),
  accepted_at   timestamptz,
  unique (workspace_id, email)
);

-- ---------------------------------------------------------- permissions --

-- The one list of what each built-in role may do.
create or replace function private.role_caps(role text)
returns text[] language sql immutable set search_path = '' as $$
  select case role
    when 'owner_admin' then array[
      'agents.view','agents.edit','agents.invite','splits.view','riders.manage','tiers.approve','w9.view',
      'files.view','files.manage','teams.manage','deals.view','deals.edit','deals.hold','payments.manage',
      'payroll.manage','payouts.view','statements.view','members.manage','settings.manage','audit.view','reports.view']
    when 'finance_manager' then array[
      'agents.view','splits.view','w9.view','files.view','tiers.approve','deals.view','deals.edit','deals.hold',
      'payments.manage','payroll.manage','payouts.view','statements.view','audit.view','reports.view']
    when 'finance_staff' then array[
      'agents.view','splits.view','files.view','deals.view','deals.edit','payments.manage','payouts.view']
    when 'ops_manager' then array[
      'agents.view','agents.edit','agents.invite','splits.view','riders.manage','files.view','files.manage',
      'teams.manage','audit.view','reports.view']
    when 'ops_staff' then array['agents.view','agents.edit','agents.invite','files.view']
    when 'sales_manager' then array['agents.view','splits.view','deals.view']
    when 'auditor' then array[
      'agents.view','splits.view','w9.view','files.view','deals.view','payouts.view','statements.view',
      'audit.view','reports.view']
    else array[]::text[]
  end;
$$;

-- Which product a permission belongs to. A brokerage that has not bought a
-- product cannot use its permissions, whatever the person's role.
create or replace function private.cap_product(cap text)
returns text language sql immutable set search_path = '' as $$
  select case
    when cap in ('deals.view','deals.edit','deals.hold','payments.manage','payroll.manage','payroll.release',
                 'payouts.view','statements.view','override') then 'finance'
    when cap in ('agents.edit','agents.invite','riders.manage','teams.manage','files.manage') then 'ops'
    else 'any'
  end;
$$;

create or replace function private.has_cap(ws uuid, cap text)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare
  m record;
  product text := private.cap_product(cap);
  caps text[];
begin
  if private.is_platform_admin() then return true; end if;

  select mem.role, mem.custom_role_id, mem.can_override, mem.can_release_payroll, w.has_ops, w.has_finance, w.status as ws_status
    into m
    from public.workspace_members mem
    join public.workspaces w on w.id = mem.workspace_id
   where mem.workspace_id = ws and mem.user_id = (select auth.uid()) and mem.status = 'active';
  if not found or m.ws_status <> 'active' then return false; end if;

  if product = 'finance' and not m.has_finance then return false; end if;
  if product = 'ops' and not m.has_ops then return false; end if;

  if cap = 'override' then return m.role = 'owner_admin' or m.can_override; end if;
  if cap = 'payroll.release' then return m.role = 'owner_admin' or m.can_release_payroll; end if;

  if m.custom_role_id is not null then
    select r.caps into caps from public.custom_roles r where r.id = m.custom_role_id;
  else
    caps := private.role_caps(m.role);
  end if;
  return cap = any (coalesce(caps, array[]::text[]));
end;
$$;

-- Some roles are limited to one office: sales managers, and custom roles
-- that were given an office. Everyone else sees every office.
create or replace function private.office_ok(ws uuid, office uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.is_platform_admin() or exists (
    select 1
      from public.workspace_members m
      left join public.custom_roles r on r.id = m.custom_role_id
      cross join lateral (
        select case when m.custom_role_id is not null then r.office_id
                    when m.role = 'sales_manager' then m.office_id end as scope) s
     where m.workspace_id = ws and m.user_id = (select auth.uid())
       and (s.scope is null or s.scope = office)
  );
$$;

-- Everything the app needs to know about the signed-in person, in one call.
create or replace function public.my_access(ws uuid default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  me uuid := (select auth.uid());
  admin boolean := private.is_platform_admin();
  chosen uuid;
  all_caps text[] := array[
    'agents.view','agents.edit','agents.invite','splits.view','riders.manage','tiers.approve','w9.view',
    'files.view','files.manage','teams.manage','deals.view','deals.edit','deals.hold','payments.manage',
    'payroll.manage','payroll.release','override','payouts.view','statements.view','members.manage',
    'settings.manage','audit.view','reports.view'];
  result jsonb;
begin
  if me is null then return null; end if;

  select w.id into chosen
    from public.workspaces w
   where (ws is null or w.id = ws)
     and (admin or exists (select 1 from public.workspace_members m
                            where m.workspace_id = w.id and m.user_id = me and m.status = 'active'))
   order by (w.id = ws) desc, w.created_at
   limit 1;

  select jsonb_build_object(
    'is_platform_admin', admin,
    'workspace', (select jsonb_build_object('id', w.id, 'name', w.name, 'timezone', w.timezone,
                    'has_ops', w.has_ops, 'has_finance', w.has_finance, 'addons', w.addons, 'status', w.status)
                    from public.workspaces w where w.id = chosen),
    'role', coalesce((select coalesce(r.name, m.role) from public.workspace_members m
                        left join public.custom_roles r on r.id = m.custom_role_id
                       where m.workspace_id = chosen and m.user_id = me),
                     case when admin then 'kinu_staff' end),
    'display_name', (select m.display_name from public.workspace_members m
                      where m.user_id = me and m.display_name is not null
                      order by (m.workspace_id = chosen) desc limit 1),
    'caps', coalesce((select jsonb_agg(c) from unnest(all_caps) c where chosen is not null and private.has_cap(chosen, c)), '[]'::jsonb),
    'workspaces', coalesce((select jsonb_agg(jsonb_build_object('id', w.id, 'name', w.name) order by w.name)
                    from public.workspaces w
                   where admin or exists (select 1 from public.workspace_members m
                                           where m.workspace_id = w.id and m.user_id = me and m.status = 'active')), '[]'::jsonb)
  ) into result;
  return result;
end;
$$;

-- What a given built-in role can do in a brokerage. Used for "view as".
create or replace function public.role_preview(ws uuid, role text)
returns text[] language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(c), array[]::text[])
    from unnest(private.role_caps(role)) c, public.workspaces w
   where w.id = ws
     and private.has_cap(ws, 'agents.view')
     and (private.cap_product(c) = 'any'
          or (private.cap_product(c) = 'finance' and w.has_finance)
          or (private.cap_product(c) = 'ops' and w.has_ops));
$$;

-- ------------------------------------------------------------ audit log --

create table if not exists public.audit_log (
  id            bigint generated always as identity primary key,
  workspace_id  uuid references public.workspaces (id) on delete cascade,
  actor_id      uuid,
  actor_label   text,
  action        text not null,
  entity        text not null,
  entity_id     text,
  summary       text,
  detail        jsonb,
  at            timestamptz not null default now()
);
create index if not exists audit_log_ws_idx on public.audit_log (workspace_id, at desc);
create index if not exists audit_log_entity_idx on public.audit_log (workspace_id, entity, entity_id);

create or replace function private.actor_label()
returns text language sql stable security definer set search_path = '' as $$
  select coalesce(
    nullif(current_setting('kinu.actor', true), ''),
    (select coalesce(m.display_name, m.email) from public.workspace_members m
      where m.user_id = (select auth.uid()) order by m.created_at limit 1),
    (select u.email::text from auth.users u where u.id = (select auth.uid())),
    'System');
$$;

create or replace function private.log(ws uuid, action text, entity text, entity_id text, summary text, detail jsonb default null)
returns void language sql security definer set search_path = '' as $$
  insert into public.audit_log (workspace_id, actor_id, actor_label, action, entity, entity_id, summary, detail)
  values (ws, (select auth.uid()), private.actor_label(), action, entity, entity_id, summary, detail);
$$;

-- Generic trigger: records who changed what on any business table.
create or replace function private.audit_row()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  old_j jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  new_j jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
  row_j jsonb := coalesce(new_j, old_j);
  changed jsonb;
begin
  -- When a whole brokerage is being removed there is nothing left to log against.
  if tg_op = 'DELETE' and not exists (
       select 1 from public.workspaces w
        where w.id = case when tg_table_name = 'workspaces' then null else (row_j ->> 'workspace_id')::uuid end) then
    return old;
  end if;

  if tg_op = 'UPDATE' then
    select jsonb_object_agg(n.key, n.value) into changed
      from jsonb_each(new_j) n
     where n.value is distinct from old_j -> n.key
       and n.key not in ('updated_at', 'invite_token_hash');
    if changed is null then return new; end if;
  end if;

  insert into public.audit_log (workspace_id, actor_id, actor_label, action, entity, entity_id, detail)
  values (
    case when tg_table_name = 'workspaces' then (row_j ->> 'id')::uuid else (row_j ->> 'workspace_id')::uuid end,
    (select auth.uid()),
    private.actor_label(),
    lower(tg_op),
    tg_table_name,
    coalesce(row_j ->> 'id', row_j ->> 'user_id'),
    case tg_op when 'UPDATE' then changed
               when 'INSERT' then new_j - 'invite_token_hash'
               else old_j - 'invite_token_hash' end
  );
  return coalesce(new, old);
end;
$$;

-- ------------------------------------------------- rules for these tables --

do $$
declare t text;
begin
  foreach t in array array['platform_admins','offices','custom_roles','member_invites','audit_log'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('revoke all on table public.%I from anon, authenticated', t);
    execute format('grant select on table public.%I to authenticated', t);
  end loop;
end $$;

drop policy if exists "admins see themselves" on public.platform_admins;
create policy "admins see themselves" on public.platform_admins
  for select to authenticated using (user_id = (select auth.uid()));

-- Brokerages: Kinu staff see all; members see their own.
drop policy if exists "members read their workspace" on public.workspaces;
create policy "members read their workspace" on public.workspaces
  for select to authenticated
  using ((select private.is_platform_admin()) or (select private.is_workspace_member(id)));

-- Memberships: your own row, or everyone's if you manage members.
drop policy if exists "users read their own membership" on public.workspace_members;
create policy "users read their own membership" on public.workspace_members
  for select to authenticated
  using (user_id = (select auth.uid()) or private.has_cap(workspace_id, 'members.manage') or private.has_cap(workspace_id, 'audit.view'));

drop policy if exists "members read offices" on public.offices;
create policy "members read offices" on public.offices
  for select to authenticated using (private.has_cap(workspace_id, 'agents.view'));
drop policy if exists "settings managers write offices" on public.offices;
create policy "settings managers write offices" on public.offices
  for all to authenticated
  using (private.has_cap(workspace_id, 'settings.manage'))
  with check (private.has_cap(workspace_id, 'settings.manage'));
grant insert, update, delete on table public.offices to authenticated;

drop policy if exists "member managers read roles" on public.custom_roles;
create policy "member managers read roles" on public.custom_roles
  for select to authenticated using (private.has_cap(workspace_id, 'members.manage') or private.has_cap(workspace_id, 'audit.view'));

drop policy if exists "member managers read invites" on public.member_invites;
create policy "member managers read invites" on public.member_invites
  for select to authenticated using (private.has_cap(workspace_id, 'members.manage'));

drop policy if exists "auditors read the log" on public.audit_log;
create policy "auditors read the log" on public.audit_log
  for select to authenticated using (workspace_id is not null and private.has_cap(workspace_id, 'audit.view'));

-- ----------------------------------------------- people and role changes --
-- These go through functions so the rules live in one place and are logged.

create or replace function public.set_member(
  ws uuid, member uuid, new_role text default null, new_status text default null,
  new_office uuid default null, new_custom_role uuid default null, clear_office boolean default false,
  clear_custom_role boolean default false, new_name text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare cur record;
begin
  if not private.has_cap(ws, 'members.manage') then raise exception 'not allowed' using errcode = '42501'; end if;
  select * into cur from public.workspace_members where workspace_id = ws and user_id = member;
  if not found then raise exception 'no such member'; end if;
  if new_role is not null and new_role not in ('owner_admin','finance_manager','finance_staff','ops_manager','ops_staff','sales_manager','auditor') then
    raise exception 'unknown role'; end if;
  if new_status is not null and new_status not in ('active','removed') then raise exception 'unknown status'; end if;
  -- Never leave a brokerage without an active owner.
  if cur.role = 'owner_admin' and cur.status = 'active'
     and (coalesce(new_role, cur.role) <> 'owner_admin' or coalesce(new_status, cur.status) <> 'active')
     and not exists (select 1 from public.workspace_members o where o.workspace_id = ws and o.user_id <> member
                       and o.role = 'owner_admin' and o.status = 'active') then
    raise exception 'A brokerage needs at least one active owner.';
  end if;

  update public.workspace_members set
    role = coalesce(new_role, role),
    status = coalesce(new_status, status),
    office_id = case when clear_office then null else coalesce(new_office, office_id) end,
    custom_role_id = case when clear_custom_role then null else coalesce(new_custom_role, custom_role_id) end,
    display_name = coalesce(nullif(trim(new_name), ''), display_name),
    -- Changing someone's role or removing them takes their big powers away.
    can_override = case when new_role is not null or new_status = 'removed' then false else can_override end,
    can_release_payroll = case when new_role is not null or new_status = 'removed' then false else can_release_payroll end
  where workspace_id = ws and user_id = member;
end;
$$;

-- Big powers: only an owner (or Kinu staff) can grant or take them away.
create or replace function public.grant_power(ws uuid, member uuid, power text, granted boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not (private.is_platform_admin() or exists (
        select 1 from public.workspace_members m
         where m.workspace_id = ws and m.user_id = (select auth.uid()) and m.role = 'owner_admin' and m.status = 'active')) then
    raise exception 'Only the owner can grant this.' using errcode = '42501';
  end if;
  if power = 'override' then
    update public.workspace_members set can_override = granted where workspace_id = ws and user_id = member;
  elsif power = 'payroll.release' then
    update public.workspace_members set can_release_payroll = granted where workspace_id = ws and user_id = member;
  else
    raise exception 'unknown power';
  end if;
  perform private.log(ws, case when granted then 'grant' else 'revoke' end, 'power', member::text,
    (case when granted then 'Granted ' else 'Removed ' end) || power);
end;
$$;

create or replace function public.save_custom_role(ws uuid, role_id uuid, role_name text, role_caps text[], role_office uuid default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare out_id uuid; allowed text[] := private.role_caps('owner_admin');
begin
  if not private.has_cap(ws, 'members.manage') then raise exception 'not allowed' using errcode = '42501'; end if;
  -- Big powers can never be part of a role; they are granted person by person.
  role_caps := array(select c from unnest(role_caps) c where c = any (allowed));
  if role_id is null then
    insert into public.custom_roles (workspace_id, name, caps, office_id) values (ws, trim(role_name), role_caps, role_office)
    returning id into out_id;
  else
    update public.custom_roles set name = trim(role_name), caps = role_caps, office_id = role_office
     where id = role_id and workspace_id = ws returning id into out_id;
  end if;
  return out_id;
end;
$$;

create or replace function public.delete_custom_role(ws uuid, role_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not private.has_cap(ws, 'members.manage') then raise exception 'not allowed' using errcode = '42501'; end if;
  delete from public.custom_roles where id = role_id and workspace_id = ws;
end;
$$;

create or replace function public.invite_member(ws uuid, invite_email text, invite_role text, invite_office uuid default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare out_id uuid; existing uuid; clean text := lower(trim(invite_email));
begin
  if not private.has_cap(ws, 'members.manage') then raise exception 'not allowed' using errcode = '42501'; end if;
  if invite_role not in ('owner_admin','finance_manager','finance_staff','ops_manager','ops_staff','sales_manager','auditor') then
    raise exception 'unknown role'; end if;
  if clean !~ '^[^\s@]+@[^\s@]+\.[^\s@]{2,}$' then raise exception 'That email does not look right.'; end if;

  insert into public.member_invites (workspace_id, email, role, office_id, invited_by)
  values (ws, clean, invite_role, invite_office, (select auth.uid()))
  on conflict (workspace_id, email) do update set role = excluded.role, office_id = excluded.office_id, accepted_at = null
  returning id into out_id;

  -- If that person already has a Kinu login, add them straight away.
  select u.id into existing from auth.users u where lower(u.email) = clean;
  if existing is not null then
    insert into public.workspace_members (workspace_id, user_id, role, office_id, email)
    values (ws, existing, invite_role, invite_office, clean)
    on conflict (workspace_id, user_id) do update set role = excluded.role, office_id = excluded.office_id, status = 'active';
    update public.member_invites set accepted_at = now() where id = out_id;
  end if;
  return out_id;
end;
$$;

create or replace function public.cancel_invite(ws uuid, invite uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not private.has_cap(ws, 'members.manage') then raise exception 'not allowed' using errcode = '42501'; end if;
  delete from public.member_invites where id = invite and workspace_id = ws and accepted_at is null;
end;
$$;

-- When an invited person signs in for the first time, join them up.
create or replace function public.accept_my_invites()
returns integer language plpgsql security definer set search_path = '' as $$
declare me uuid := (select auth.uid()); my_email text; n integer := 0; inv record;
begin
  if me is null then return 0; end if;
  select lower(u.email) into my_email from auth.users u where u.id = me;
  for inv in select * from public.member_invites i where i.email = my_email and i.accepted_at is null loop
    insert into public.workspace_members (workspace_id, user_id, role, office_id, email)
    values (inv.workspace_id, me, inv.role, inv.office_id, my_email)
    on conflict (workspace_id, user_id) do nothing;
    update public.member_invites set accepted_at = now() where id = inv.id;
    n := n + 1;
  end loop;
  return n;
end;
$$;

-- --------------------------------------------- Kinu staff: brokerages --

create or replace function public.platform_create_workspace(
  ws_name text, ws_ops boolean, ws_finance boolean, ws_addons text[], ws_timezone text default 'America/New_York',
  owner_email text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare out_id uuid;
begin
  if not private.is_platform_admin() then raise exception 'Kinu staff only' using errcode = '42501'; end if;
  if char_length(trim(coalesce(ws_name, ''))) < 2 then raise exception 'Give the brokerage a name.'; end if;
  insert into public.workspaces (name, timezone, has_ops, has_finance, addons, created_by)
  values (trim(ws_name), ws_timezone, ws_ops, ws_finance,
          array(select a from unnest(coalesce(ws_addons, '{}')) a where a in ('retention','finance_shield','compliance')),
          (select auth.uid()))
  returning id into out_id;
  insert into public.offices (workspace_id, name) values (out_id, 'Main office');
  if nullif(trim(coalesce(owner_email, '')), '') is not null then
    perform public.invite_member(out_id, owner_email, 'owner_admin');
  end if;
  return out_id;
end;
$$;

create or replace function public.platform_update_workspace(
  ws uuid, ws_name text default null, ws_ops boolean default null, ws_finance boolean default null,
  ws_addons text[] default null, ws_status text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_platform_admin() then raise exception 'Kinu staff only' using errcode = '42501'; end if;
  if ws_status is not null and ws_status not in ('active','paused','closed') then raise exception 'unknown status'; end if;
  update public.workspaces set
    name = coalesce(nullif(trim(ws_name), ''), name),
    has_ops = coalesce(ws_ops, has_ops),
    has_finance = coalesce(ws_finance, has_finance),
    addons = coalesce(array(select a from unnest(ws_addons) a where a in ('retention','finance_shield','compliance')), addons),
    status = coalesce(ws_status, status)
  where id = ws;
end;
$$;

create or replace function public.platform_overview()
returns table (id uuid, name text, status text, has_ops boolean, has_finance boolean, addons text[],
               created_at timestamptz, members bigint, agents bigint, pending_invites bigint)
language sql stable security definer set search_path = '' as $$
  select w.id, w.name, w.status, w.has_ops, w.has_finance, w.addons, w.created_at,
         (select count(*) from public.workspace_members m where m.workspace_id = w.id and m.status = 'active'),
         (select count(*) from public.agents a where a.workspace_id = w.id),
         (select count(*) from public.member_invites i where i.workspace_id = w.id and i.accepted_at is null)
    from public.workspaces w
   where private.is_platform_admin()
   order by w.created_at;
$$;

-- Brokerage settings its own admins may change.
create or replace function public.update_settings(
  ws uuid, ws_timezone text default null, ws_weekdays integer[] default null, ws_cutoff time default null,
  ws_close time default null, ws_alias text default null, ws_max_teams integer default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not private.has_cap(ws, 'settings.manage') then raise exception 'not allowed' using errcode = '42501'; end if;
  if ws_weekdays is not null and (cardinality(ws_weekdays) = 0 or exists (select 1 from unnest(ws_weekdays) d where d not between 1 and 7)) then
    raise exception 'Pick at least one payroll day.'; end if;
  update public.workspaces set
    timezone = coalesce(nullif(trim(ws_timezone), ''), timezone),
    payroll_weekdays = coalesce(ws_weekdays, payroll_weekdays),
    cutoff_time = coalesce(ws_cutoff, cutoff_time),
    close_time = coalesce(ws_close, close_time),
    reply_alias = coalesce(nullif(lower(trim(ws_alias)), ''), reply_alias),
    max_teams_per_agent = coalesce(ws_max_teams, max_teams_per_agent)
  where id = ws;
end;
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'public.my_access(uuid)', 'public.role_preview(uuid, text)',
    'public.set_member(uuid, uuid, text, text, uuid, uuid, boolean, boolean, text)',
    'public.grant_power(uuid, uuid, text, boolean)',
    'public.save_custom_role(uuid, uuid, text, text[], uuid)', 'public.delete_custom_role(uuid, uuid)',
    'public.invite_member(uuid, text, text, uuid)', 'public.cancel_invite(uuid, uuid)', 'public.accept_my_invites()',
    'public.platform_create_workspace(text, boolean, boolean, text[], text, text)',
    'public.platform_update_workspace(uuid, text, boolean, boolean, text[], text)',
    'public.platform_overview()',
    'public.update_settings(uuid, text, integer[], time, time, text, integer)'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
  foreach f in array array['private.is_platform_admin()', 'private.has_cap(uuid, text)', 'private.office_ok(uuid, uuid)'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

-- Audit triggers for the tables above.
do $$
declare t text;
begin
  foreach t in array array['workspaces','workspace_members','offices','custom_roles','member_invites'] loop
    execute format('drop trigger if exists audit_%I on public.%I', t, t);
    execute format('create trigger audit_%I after insert or update or delete on public.%I for each row execute function private.audit_row()', t, t);
  end loop;
end $$;

-- ------------------------------------------------------ private storage --
-- One private bucket. Files live under <brokerage id>/..., so the rules can
-- tell whose they are. PDFs and images only, 10 MB at most.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('documents', 'documents', false, 10485760, array['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create or replace function private.path_workspace(object_name text)
returns uuid language plpgsql immutable set search_path = '' as $$
begin
  return split_part(object_name, '/', 1)::uuid;
exception when others then
  return null;
end;
$$;
grant execute on function private.path_workspace(text) to authenticated;

drop policy if exists "kinu members read documents" on storage.objects;
create policy "kinu members read documents" on storage.objects
  for select to authenticated
  using (bucket_id = 'documents' and private.has_cap(private.path_workspace(name), 'files.view'));

drop policy if exists "kinu staff add documents" on storage.objects;
create policy "kinu staff add documents" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'documents' and (
    private.has_cap(private.path_workspace(name), 'files.manage')
    or private.has_cap(private.path_workspace(name), 'payments.manage')));
