-- Kinu: one-paste setup for the Supabase TEST project.
-- The files below joined together, in order. Safe to run more than once.
--   supabase/migrations/0001_step1_dashboard.sql
--   supabase/migrations/0002_first_run_tour.sql
--   supabase/migrations/0003_foundation.sql
--   supabase/migrations/0004_ops_finance.sql
--   supabase/seed.sql
-- Add your own user FIRST (Authentication -> Users), then run this.

-- Roster, build step 1: the tables behind the sign-in and dashboard pages.
-- TEST project only. Safe to run more than once.
--
-- Security model (blueprint section 10):
--   * Row-level security is enabled AND forced on every table.
--   * A signed-in user can only read rows of a workspace they belong to.
--   * Nobody can insert, update or delete through the API yet: there are no
--     write policies and no write grants. The dashboard is read-only.
--   * The public (anon) role gets nothing at all.

-- A schema the API does not expose, for helper functions.
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

-- ---------------------------------------------------------------- tables --

create table if not exists public.workspaces (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 1 and 120),
  timezone    text not null default 'America/New_York',
  created_at  timestamptz not null default now()
);

create table if not exists public.workspace_members (
  workspace_id  uuid not null references public.workspaces (id) on delete cascade,
  user_id       uuid not null references auth.users (id) on delete cascade,
  role          text not null default 'ops_staff' check (role in (
                  'owner_admin', 'finance_manager', 'finance_staff',
                  'ops_manager', 'ops_staff', 'sales_manager', 'auditor')),
  display_name  text check (display_name is null or char_length(display_name) between 1 and 120),
  created_at    timestamptz not null default now(),
  primary key (workspace_id, user_id)
);
create index if not exists workspace_members_user_idx on public.workspace_members (user_id);

create table if not exists public.agents (
  id                 uuid primary key default gen_random_uuid(),
  workspace_id       uuid not null references public.workspaces (id) on delete cascade,
  full_name          text not null check (char_length(full_name) between 1 and 120),
  office             text not null,
  team_label         text,                       -- null means solo
  cohort             text,                       -- e.g. '2026-11'; null = joined before
  cohort_position    integer,                    -- display order inside the cohort
  licence_masked     text,                       -- never the full number
  licence_status     text not null default 'not_uploaded' check (licence_status in (
                       'verified', 'mismatch', 'expiring', 'not_uploaded')),
  licence_note       text,
  w9_status          text not null default 'pending' check (w9_status in (
                       'received', 'pending', 'name_mismatch')),
  rider_status       text not null default 'not_sent' check (rider_status in (
                       'signed', 'sent', 'not_sent')),
  onboarding_status  text not null default 'in_progress' check (onboarding_status in (
                       'ready', 'in_progress', 'flagged')),
  gci_ytd            numeric(12, 2) not null default 0 check (gci_ytd >= 0),
  gci_change_pct     integer,
  created_at         timestamptz not null default now()
);
create index if not exists agents_workspace_idx on public.agents (workspace_id);
create index if not exists agents_cohort_idx on public.agents (workspace_id, cohort);

create table if not exists public.onboarding_batches (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references public.workspaces (id) on delete cascade,
  sent_at         timestamptz not null,
  sent_count      integer not null check (sent_count >= 0),
  ready_count     integer not null check (ready_count >= 0),
  ready_timeline  integer[],                     -- agents ready per 5 minutes
  check (ready_count <= sent_count)
);
create index if not exists onboarding_batches_workspace_idx
  on public.onboarding_batches (workspace_id, sent_at desc);

create table if not exists public.attention_items (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces (id) on delete cascade,
  agent_id      uuid not null references public.agents (id) on delete cascade,
  tag           text not null,
  detail        text not null,
  position      integer not null default 0
);
create index if not exists attention_items_workspace_idx on public.attention_items (workspace_id);

create table if not exists public.tier_approvals (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces (id) on delete cascade,
  subject_kind  text not null check (subject_kind in ('agent', 'team')),
  subject_name  text not null,
  reason        text not null,
  from_pct      integer not null check (from_pct between 0 and 100),
  to_pct        integer not null check (to_pct between 0 and 100),
  status        text not null default 'waiting' check (status in ('waiting', 'approved', 'held')),
  position      integer not null default 0
);
create index if not exists tier_approvals_workspace_idx on public.tier_approvals (workspace_id);

-- ------------------------------------------------------- membership check --

-- Runs with the owner's rights so policies can look up membership without
-- recursing into the membership table's own policy. Fixed empty search_path.
create or replace function private.is_workspace_member(ws uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.workspace_members m
    where m.workspace_id = ws
      and m.user_id = (select auth.uid())
  );
$$;
revoke all on function private.is_workspace_member(uuid) from public, anon;
grant execute on function private.is_workspace_member(uuid) to authenticated;

-- --------------------------------------------------- row-level security --

alter table public.workspaces         enable row level security;
alter table public.workspace_members  enable row level security;
alter table public.agents             enable row level security;
alter table public.onboarding_batches enable row level security;
alter table public.attention_items    enable row level security;
alter table public.tier_approvals     enable row level security;

alter table public.workspaces         force row level security;
alter table public.workspace_members  force row level security;
alter table public.agents             force row level security;
alter table public.onboarding_batches force row level security;
alter table public.attention_items    force row level security;
alter table public.tier_approvals     force row level security;

-- Least privilege: take everything away, then give signed-in users read only.
revoke all on table
  public.workspaces, public.workspace_members, public.agents,
  public.onboarding_batches, public.attention_items, public.tier_approvals
from anon, authenticated;

grant select on table
  public.workspaces, public.workspace_members, public.agents,
  public.onboarding_batches, public.attention_items, public.tier_approvals
to authenticated;

drop policy if exists "members read their workspace" on public.workspaces;
create policy "members read their workspace" on public.workspaces
  for select to authenticated
  using ((select private.is_workspace_member(id)));

drop policy if exists "users read their own membership" on public.workspace_members;
create policy "users read their own membership" on public.workspace_members
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "members read agents" on public.agents;
create policy "members read agents" on public.agents
  for select to authenticated
  using ((select private.is_workspace_member(workspace_id)));

drop policy if exists "members read batches" on public.onboarding_batches;
create policy "members read batches" on public.onboarding_batches
  for select to authenticated
  using ((select private.is_workspace_member(workspace_id)));

drop policy if exists "members read attention items" on public.attention_items;
create policy "members read attention items" on public.attention_items
  for select to authenticated
  using ((select private.is_workspace_member(workspace_id)));

drop policy if exists "members read tier approvals" on public.tier_approvals;
create policy "members read tier approvals" on public.tier_approvals
  for select to authenticated
  using ((select private.is_workspace_member(workspace_id)));

-- Kinu: remember, per account, that a person has seen the first-run tour.
-- TEST project only. Safe to run more than once.
--
-- Security model:
--   * Row-level security is enabled and forced.
--   * A signed-in user can read only their own row.
--   * Nobody can write to the table through the API. The only way to change
--     it is the function below, which can do exactly one thing: stamp the
--     CALLER's own row with the server's current time. The browser cannot
--     choose whose row, or what value.

create table if not exists public.user_prefs (
  user_id       uuid primary key references auth.users (id) on delete cascade,
  tour_seen_at  timestamptz
);

alter table public.user_prefs enable row level security;
alter table public.user_prefs force row level security;

revoke all on table public.user_prefs from anon, authenticated;
grant select on table public.user_prefs to authenticated;

drop policy if exists "users read their own preferences" on public.user_prefs;
create policy "users read their own preferences" on public.user_prefs
  for select to authenticated
  using (user_id = (select auth.uid()));

create or replace function public.mark_tour_seen()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
begin
  if me is null then
    raise exception 'not signed in' using errcode = '28000';
  end if;

  insert into public.user_prefs (user_id, tour_seen_at)
  values (me, now())
  on conflict (user_id) do update set tour_seen_at = now();
end;
$$;

revoke all on function public.mark_tour_seen() from public, anon;
grant execute on function public.mark_tour_seen() to authenticated;

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

-- Kinu Ops and Finance: agents, riders, teams, tier approvals, files,
-- deals, payments and payroll. Safe to run more than once.
--
-- The database, not the browser, decides:
--   * whether a split on a deal matches the agent's rider (checked on save),
--   * every payout, to the cent,
--   * who may approve a tier, override a check, or release a payroll.

-- --------------------------------------------------------------- agents --

alter table public.agents
  add column if not exists email              text,
  add column if not exists phone              text,
  add column if not exists office_id          uuid references public.offices (id) on delete set null,
  add column if not exists status             text not null default 'active',
  add column if not exists licence_expires_on date,
  add column if not exists licence_file_path  text,
  add column if not exists invite_token_hash  text,
  add column if not exists invite_expires_at  timestamptz,
  add column if not exists invite_sent_at     timestamptz,
  add column if not exists details_done_at    timestamptz,
  add column if not exists joined_on          date,
  add column if not exists exited_on          date,
  add column if not exists updated_at         timestamptz not null default now();

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'agents_status_check') then
    alter table public.agents add constraint agents_status_check
      check (status in ('invited', 'onboarding', 'active', 'flagged', 'exited'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'agents_id_ws_key') then
    alter table public.agents add constraint agents_id_ws_key unique (id, workspace_id);
  end if;
end $$;
create unique index if not exists agents_invite_token_idx on public.agents (invite_token_hash) where invite_token_hash is not null;

-- Tax details are kept apart from the agent record so that only roles
-- allowed to see W-9s can read them. Never a full SSN: last four digits and
-- the W-9 service's reference only.
create table if not exists public.agent_tax (
  agent_id      uuid primary key references public.agents (id) on delete cascade,
  workspace_id  uuid not null references public.workspaces (id) on delete cascade,
  legal_name    text check (legal_name is null or char_length(legal_name) <= 160),
  tin_last4     text check (tin_last4 is null or tin_last4 ~ '^[0-9]{4}$'),
  provider_ref  text,
  received_at   timestamptz
);

create table if not exists public.teams (
  id             uuid primary key default gen_random_uuid(),
  workspace_id   uuid not null references public.workspaces (id) on delete cascade,
  name           text not null check (char_length(name) between 1 and 80),
  lead_agent_id  uuid references public.agents (id) on delete set null,
  created_at     timestamptz not null default now(),
  unique (workspace_id, name),
  unique (id, workspace_id)
);

create table if not exists public.team_members (
  team_id          uuid not null references public.teams (id) on delete cascade,
  agent_id         uuid not null references public.agents (id) on delete cascade,
  workspace_id     uuid not null references public.workspaces (id) on delete cascade,
  parent_agent_id  uuid references public.agents (id) on delete set null,
  role_label       text not null default 'Member',
  primary key (team_id, agent_id)
);

-- A rider is the signed split agreement. Each change is a new version;
-- exactly one version per agent (or team) is current.
create table if not exists public.riders (
  id             uuid primary key default gen_random_uuid(),
  workspace_id   uuid not null references public.workspaces (id) on delete cascade,
  agent_id       uuid references public.agents (id) on delete cascade,
  team_id        uuid references public.teams (id) on delete cascade,
  version        integer not null default 1,
  split_pct      numeric(5, 2) not null check (split_pct between 0 and 100),
  tiers          jsonb not null default '[]',      -- [{"from": 0, "to": 20000, "pct": 70}, ...]
  status         text not null default 'draft' check (status in ('draft', 'sent', 'signed', 'superseded', 'void')),
  is_current     boolean not null default false,
  signed_name    text,
  signed_at      timestamptz,
  signed_consent boolean not null default false,
  signature_note text,
  created_by     uuid references auth.users (id) on delete set null,
  created_at     timestamptz not null default now(),
  check ((agent_id is null) <> (team_id is null))
);
create unique index if not exists riders_current_agent_idx on public.riders (agent_id) where is_current and agent_id is not null;
create unique index if not exists riders_current_team_idx on public.riders (team_id) where is_current and team_id is not null;
create index if not exists riders_ws_idx on public.riders (workspace_id);

alter table public.tier_approvals
  add column if not exists agent_id      uuid references public.agents (id) on delete cascade,
  add column if not exists team_id       uuid references public.teams (id) on delete cascade,
  add column if not exists rider_from_id uuid references public.riders (id) on delete set null,
  add column if not exists rider_to_id   uuid references public.riders (id) on delete set null,
  add column if not exists decided_by    uuid references auth.users (id) on delete set null,
  add column if not exists decided_at    timestamptz,
  add column if not exists created_at    timestamptz not null default now();

create table if not exists public.documents (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces (id) on delete cascade,
  agent_id      uuid references public.agents (id) on delete cascade,
  deal_id       uuid,
  kind          text not null check (kind in ('licence', 'w9', 'rider', 'agreement', 'audit_export', 'payment_proof')),
  filename      text not null check (char_length(filename) between 1 and 200),
  path          text,                       -- place in private storage; null for records without a file
  status        text not null default 'on_file',
  note          text,
  created_at    timestamptz not null default now()
);
create index if not exists documents_ws_idx on public.documents (workspace_id, kind);

-- ---------------------------------------------------------------- deals --

create table if not exists public.payrolls (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces (id) on delete cascade,
  pay_date      date not null,
  cutoff_at     timestamptz not null,
  status        text not null default 'open' check (status in ('open', 'cutoff', 'released', 'closed')),
  released_by   uuid references auth.users (id) on delete set null,
  released_at   timestamptz,
  closed_at     timestamptz,
  unique (workspace_id, pay_date),
  unique (id, workspace_id)
);

create table if not exists public.deals (
  id             uuid primary key default gen_random_uuid(),
  workspace_id   uuid not null references public.workspaces (id) on delete cascade,
  office_id      uuid references public.offices (id) on delete set null,
  address        text not null check (char_length(address) between 3 and 200),
  deal_type      text not null check (deal_type in ('landlord', 'seller', 'tenant', 'buyer', 'dual', 'pass_through', 'referral')),
  gci            numeric(12, 2) not null default 0 check (gci >= 0),
  net            numeric(12, 2) not null default 0,
  company_dollar numeric(12, 2) not null default 0,
  deposit_date   date,
  status         text not null default 'open' check (status in ('open', 'cleared', 'held', 'processed', 'closed')),
  held_reason    text,
  waiting_on     text not null default 'finance' check (waiting_on in ('finance', 'agent', 'nobody')),
  payroll_id     uuid references public.payrolls (id) on delete set null,
  pp_number      text,
  parties        jsonb not null default '[]',      -- [{"kind": "landlord", "name": "..."}]
  notes          text,
  created_by     uuid references auth.users (id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (id, workspace_id)
);
create index if not exists deals_ws_idx on public.deals (workspace_id, status);
create index if not exists deals_address_idx on public.deals (workspace_id, lower(address));

create table if not exists public.deal_agents (
  id                uuid primary key default gen_random_uuid(),
  deal_id           uuid not null references public.deals (id) on delete cascade,
  workspace_id      uuid not null references public.workspaces (id) on delete cascade,
  agent_id          uuid not null references public.agents (id),
  basis             text not null default 'individual' check (basis in ('individual', 'team')),
  share_pct         numeric(5, 2) not null default 100 check (share_pct between 0 and 100),
  split_pct         numeric(5, 2) not null check (split_pct between 0 and 100),
  rider_pct         numeric(5, 2),
  check_status      text not null default 'skipped' check (check_status in ('correct', 'incorrect', 'needs_approval', 'skipped', 'overridden')),
  check_reason      text,
  override_reason   text,
  override_note     text,
  payout            numeric(12, 2) not null default 0,
  unique (deal_id, agent_id)
);
create index if not exists deal_agents_ws_idx on public.deal_agents (workspace_id, agent_id);

create table if not exists public.deal_fees (
  id            uuid primary key default gen_random_uuid(),
  deal_id       uuid not null references public.deals (id) on delete cascade,
  workspace_id  uuid not null references public.workspaces (id) on delete cascade,
  kind          text not null check (kind in ('referral', 'outside')),
  payee         text not null check (char_length(payee) between 1 and 160),
  amount        numeric(12, 2) not null check (amount >= 0)
);

create table if not exists public.deal_checklist (
  id            uuid primary key default gen_random_uuid(),
  deal_id       uuid not null references public.deals (id) on delete cascade,
  workspace_id  uuid not null references public.workspaces (id) on delete cascade,
  label         text not null check (char_length(label) between 1 and 120),
  done          boolean not null default false,
  done_at       timestamptz,
  position      integer not null default 0
);

create table if not exists public.payments (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces (id) on delete cascade,
  method        text not null check (method in ('check', 'wire', 'hyfin')),
  amount        numeric(12, 2) not null check (amount > 0),
  received_on   date not null,
  reference     text,
  proof_path    text,
  explanation   text,
  created_by    uuid references auth.users (id) on delete set null,
  created_at    timestamptz not null default now()
);

create table if not exists public.payment_allocations (
  id            uuid primary key default gen_random_uuid(),
  payment_id    uuid not null references public.payments (id) on delete cascade,
  deal_id       uuid not null references public.deals (id) on delete cascade,
  workspace_id  uuid not null references public.workspaces (id) on delete cascade,
  amount        numeric(12, 2) not null check (amount > 0),
  unique (payment_id, deal_id)
);

-- A row can never point at something in another brokerage.
create or replace function private.same_workspace()
returns trigger language plpgsql security definer set search_path = '' as $$
declare parent_ws uuid; col text; tbl text; i integer;
begin
  for i in 0 .. (tg_nargs / 2) - 1 loop
    col := tg_argv[i * 2]; tbl := tg_argv[i * 2 + 1];
    if (to_jsonb(new) ->> col) is not null then
      execute format('select workspace_id from public.%I where id = $1', tbl)
        into parent_ws using (to_jsonb(new) ->> col)::uuid;
      if parent_ws is distinct from new.workspace_id then
        raise exception 'That record belongs to a different brokerage.' using errcode = '42501';
      end if;
    end if;
  end loop;
  return new;
end;
$$;

do $$
declare r record;
begin
  for r in select * from (values
      ('agents', array['office_id','offices']),
      ('agent_tax', array['agent_id','agents']),
      ('teams', array['lead_agent_id','agents']),
      ('team_members', array['team_id','teams','agent_id','agents','parent_agent_id','agents']),
      ('riders', array['agent_id','agents','team_id','teams']),
      ('tier_approvals', array['agent_id','agents','team_id','teams']),
      ('documents', array['agent_id','agents','deal_id','deals']),
      ('deals', array['office_id','offices','payroll_id','payrolls']),
      ('deal_agents', array['deal_id','deals','agent_id','agents']),
      ('deal_fees', array['deal_id','deals']),
      ('deal_checklist', array['deal_id','deals']),
      ('payment_allocations', array['payment_id','payments','deal_id','deals'])
    ) as t (tbl, args) loop
    execute format('drop trigger if exists same_ws on public.%I', r.tbl);
    execute format('create trigger same_ws before insert or update on public.%I for each row execute function private.same_workspace(%s)',
      r.tbl, (select string_agg(quote_literal(a), ', ') from unnest(r.args) a));
  end loop;
end $$;

-- ------------------------------------------------ rider check and payouts --

create or replace function private.current_rider_pct(agent uuid, how text)
returns numeric language sql stable security definer set search_path = '' as $$
  select case when how = 'team' then
    (select r.split_pct from public.riders r
       join public.team_members tm on tm.team_id = r.team_id
      where tm.agent_id = agent and r.is_current limit 1)
  else
    (select r.split_pct from public.riders r where r.agent_id = agent and r.is_current)
  end;
$$;

-- Runs on every save of an agent line on a deal. The browser's opinion of
-- whether the split is right is ignored; this decides.
create or replace function private.check_deal_agent()
returns trigger language plpgsql security definer set search_path = '' as $$
declare kind text; rider numeric; who text; pct text;
begin
  if current_setting('kinu.recalc', true) = 'on' then return new; end if;
  select d.deal_type into kind from public.deals d where d.id = new.deal_id;
  rider := private.current_rider_pct(new.agent_id, new.basis);
  new.rider_pct := rider;

  -- An override stands until the split itself is edited again.
  if current_setting('kinu.override', true) = 'on' then return new; end if;
  if tg_op = 'UPDATE' and old.check_status = 'overridden' and new.split_pct = old.split_pct and new.basis = old.basis then
    new.check_status := 'overridden'; return new;
  end if;
  new.override_reason := null; new.override_note := null;

  if kind in ('pass_through', 'referral') then
    new.check_status := 'skipped'; new.check_reason := 'Not checked for this deal type.';
  elsif rider is null then
    new.check_status := 'incorrect'; new.check_reason := 'No signed rider on file for this agent.';
  elsif new.split_pct = rider then
    new.check_status := 'correct'; new.check_reason := null;
  else
    select split_part(a.full_name, ' ', 1) into who from public.agents a where a.id = new.agent_id;
    pct := trim(to_char(new.split_pct, 'FM990.##'), '.');
    if exists (select 1 from public.tier_approvals t
                where t.agent_id = new.agent_id and t.status in ('waiting', 'held') and t.to_pct = new.split_pct) then
      new.check_status := 'needs_approval';
      new.check_reason := format('Incorrect: %s%% needs approval. %s''s current rider is %s%%.', pct, who, trim(to_char(rider, 'FM990.##'), '.'));
    else
      new.check_status := 'incorrect';
      new.check_reason := format('You entered %s%%. %s''s rider is %s%%.', pct, who, trim(to_char(rider, 'FM990.##'), '.'));
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists check_split on public.deal_agents;
create trigger check_split before insert or update on public.deal_agents
  for each row execute function private.check_deal_agent();

-- Money, to the cent: GCI less referral and outside fees is the net; each
-- agent gets their share of the net at their split; the rest is company dollar.
create or replace function private.recalc_deal(deal uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare g numeric; fees numeric; n numeric; paid numeric;
begin
  select d.gci into g from public.deals d where d.id = deal;
  if not found then return; end if;
  select coalesce(sum(f.amount), 0) into fees from public.deal_fees f where f.deal_id = deal;
  n := greatest(g - fees, 0);
  perform set_config('kinu.recalc', 'on', true);
  update public.deal_agents da
     set payout = round(n * da.share_pct / 100 * da.split_pct / 100, 2)
   where da.deal_id = deal;
  select coalesce(sum(da.payout), 0) into paid from public.deal_agents da where da.deal_id = deal;
  update public.deals set net = n, company_dollar = n - paid, updated_at = now() where id = deal;
  perform set_config('kinu.recalc', 'off', true);
end;
$$;

create or replace function private.recalc_deal_trigger()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if current_setting('kinu.recalc', true) = 'on' then return null; end if;
  if tg_table_name = 'deals' then
    perform private.recalc_deal(new.id);
  else
    perform private.recalc_deal(coalesce(new.deal_id, old.deal_id));
  end if;
  return null;
end;
$$;

drop trigger if exists recalc on public.deal_agents;
create trigger recalc after insert or update or delete on public.deal_agents
  for each row execute function private.recalc_deal_trigger();
drop trigger if exists recalc on public.deal_fees;
create trigger recalc after insert or update or delete on public.deal_fees
  for each row execute function private.recalc_deal_trigger();
drop trigger if exists recalc on public.deals;
create trigger recalc after insert or update of gci, deal_type on public.deals
  for each row execute function private.recalc_deal_trigger();

-- Changing a deal's type changes whether its lines are checked at all.
create or replace function private.recheck_lines()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.deal_agents set split_pct = split_pct where deal_id = new.id;
  return null;
end;
$$;
drop trigger if exists recheck on public.deals;
create trigger recheck after update of deal_type on public.deals
  for each row execute function private.recheck_lines();

-- Only the payroll functions may move a deal into a payroll or close it,
-- and a processed or closed deal can no longer be edited.
create or replace function private.guard_deal()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if current_setting('kinu.payroll', true) = 'on' or current_setting('kinu.recalc', true) = 'on' then return new; end if;
  if tg_op = 'INSERT' then
    if new.status not in ('open', 'held') then new.status := 'open'; end if;
    new.payroll_id := null;
    return new;
  end if;
  if old.status in ('processed', 'closed') then
    raise exception 'This deal is in a payroll and can no longer be changed.';
  end if;
  if new.status in ('processed', 'closed') or new.payroll_id is distinct from old.payroll_id then
    raise exception 'Deals enter a payroll at cutoff, not by hand.';
  end if;
  if new.status is distinct from old.status and not private.has_cap(new.workspace_id, 'deals.hold') then
    raise exception 'You are not allowed to hold or clear deals.' using errcode = '42501';
  end if;
  if new.status = 'held' and nullif(trim(coalesce(new.held_reason, '')), '') is null then
    raise exception 'Give a reason for holding this deal.';
  end if;
  if new.status <> 'held' then new.held_reason := null; end if;
  if new.status = 'cleared' and exists (
       select 1 from public.deal_agents da where da.deal_id = new.id and da.check_status in ('incorrect', 'needs_approval')) then
    raise exception 'A split on this deal does not match the rider. Fix it, get the tier approved, or have it overridden first.';
  end if;
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists guard on public.deals;
create trigger guard before insert or update on public.deals
  for each row execute function private.guard_deal();

-- Lines of a deal that is already in a payroll are frozen too.
create or replace function private.guard_deal_child()
returns trigger language plpgsql security definer set search_path = '' as $$
declare st text;
begin
  if current_setting('kinu.payroll', true) = 'on' or current_setting('kinu.recalc', true) = 'on' then return coalesce(new, old); end if;
  select d.status into st from public.deals d where d.id = coalesce(new.deal_id, old.deal_id);
  if st in ('processed', 'closed') then
    raise exception 'This deal is in a payroll and can no longer be changed.';
  end if;
  return coalesce(new, old);
end;
$$;
do $$
declare t text;
begin
  foreach t in array array['deal_agents', 'deal_fees'] loop
    execute format('drop trigger if exists guard_child on public.%I', t);
    execute format('create trigger guard_child before insert or update or delete on public.%I for each row execute function private.guard_deal_child()', t);
  end loop;
end $$;

-- -------------------------------------------------- rules for the tables --

do $$
declare r record;
begin
  for r in select * from (values
      ('agents',              'agents.view',   'agents.edit'),
      ('agent_tax',           'w9.view',       null),
      ('teams',               'agents.view',   'teams.manage'),
      ('team_members',        'agents.view',   'teams.manage'),
      ('riders',              'splits.view',   null),
      ('tier_approvals',      'splits.view',   null),
      ('documents',           'files.view',    'files.manage'),
      ('onboarding_batches',  'agents.view',   null),
      ('attention_items',     'agents.view',   null),
      ('payrolls',            'deals.view',    null),
      ('deals',               'deals.view',    'deals.edit'),
      ('deal_agents',         'deals.view',    'deals.edit'),
      ('deal_fees',           'deals.view',    'deals.edit'),
      ('deal_checklist',      'deals.view',    'deals.edit'),
      ('payments',            'deals.view',    'payments.manage'),
      ('payment_allocations', 'deals.view',    'payments.manage')
    ) as t (tbl, read_cap, write_cap) loop
    execute format('alter table public.%I enable row level security', r.tbl);
    execute format('alter table public.%I force row level security', r.tbl);
    execute format('revoke all on table public.%I from anon, authenticated', r.tbl);
    execute format('grant select on table public.%I to authenticated', r.tbl);
    execute (select coalesce(string_agg(format('drop policy if exists %I on public.%I', p.policyname, r.tbl), '; '), 'select 1')
               from pg_policies p where p.schemaname = 'public' and p.tablename = r.tbl);
    execute format('create policy "read" on public.%I for select to authenticated using (private.has_cap(workspace_id, %L)%s)',
      r.tbl, r.read_cap,
      case when r.tbl in ('agents', 'deals') then ' and private.office_ok(workspace_id, office_id)' else '' end);
    if r.write_cap is not null then
      execute format('grant insert, update, delete on table public.%I to authenticated', r.tbl);
      execute format('create policy "write" on public.%I for all to authenticated using (private.has_cap(workspace_id, %L)) with check (private.has_cap(workspace_id, %L))',
        r.tbl, r.write_cap, r.write_cap);
    end if;
    execute format('drop trigger if exists audit_%I on public.%I', r.tbl, r.tbl);
    if r.tbl not in ('onboarding_batches', 'attention_items') then
      execute format('create trigger audit_%I after insert or update or delete on public.%I for each row execute function private.audit_row()', r.tbl, r.tbl);
    end if;
  end loop;
end $$;

-- Ops may edit an agent's contact details, but not the fields that record
-- what was verified. Those change only through the functions below.
create or replace function private.guard_agent()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if current_setting('kinu.trusted', true) = 'on' then return new; end if;
  if tg_op = 'UPDATE' then
    new.workspace_id := old.workspace_id;
    new.invite_token_hash := old.invite_token_hash;
    new.invite_expires_at := old.invite_expires_at;
    new.gci_ytd := old.gci_ytd;
    if not private.has_cap(new.workspace_id, 'riders.manage') then
      new.licence_status := old.licence_status;
      new.w9_status := old.w9_status;
      new.rider_status := old.rider_status;
      new.onboarding_status := old.onboarding_status;
    end if;
  else
    new.invite_token_hash := null;
    new.gci_ytd := 0;
  end if;
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists guard on public.agents;
create trigger guard before insert or update on public.agents
  for each row execute function private.guard_agent();

-- ----------------------------------------------------- riders and tiers --

create or replace function private.make_rider(ws uuid, agent uuid, team uuid, pct numeric, rider_tiers jsonb, new_status text, note text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare out_id uuid; next_version integer;
begin
  select coalesce(max(r.version), 0) + 1 into next_version from public.riders r
   where (agent is not null and r.agent_id = agent) or (team is not null and r.team_id = team);
  if new_status = 'signed' then
    update public.riders set is_current = false, status = 'superseded'
     where is_current and ((agent is not null and agent_id = agent) or (team is not null and team_id = team));
  end if;
  insert into public.riders (workspace_id, agent_id, team_id, version, split_pct, tiers, status, is_current,
                             signed_at, signature_note, created_by)
  values (ws, agent, team, next_version, pct, coalesce(rider_tiers, '[]'), new_status, new_status = 'signed',
          case when new_status = 'signed' then now() end, note, (select auth.uid()))
  returning id into out_id;
  return out_id;
end;
$$;

-- Ops drafts a rider (or an amendment). It takes effect only when signed.
create or replace function public.draft_rider(ws uuid, agent uuid, team uuid, pct numeric, rider_tiers jsonb default '[]')
returns uuid language plpgsql security definer set search_path = '' as $$
begin
  if not private.has_cap(ws, 'riders.manage') then raise exception 'not allowed' using errcode = '42501'; end if;
  update public.riders set status = 'void'
   where status in ('draft', 'sent') and ((agent is not null and agent_id = agent) or (team is not null and team_id = team));
  if agent is not null then
    perform set_config('kinu.trusted', 'on', true);
    update public.agents set rider_status = 'sent' where id = agent and workspace_id = ws and rider_status <> 'signed';
  end if;
  return private.make_rider(ws, agent, team, pct, rider_tiers, 'sent', null);
end;
$$;

-- Recording a signature a brokerage collected itself (for example on paper).
create or replace function public.mark_rider_signed(ws uuid, rider uuid, signer text)
returns void language plpgsql security definer set search_path = '' as $$
declare r record;
begin
  if not private.has_cap(ws, 'riders.manage') then raise exception 'not allowed' using errcode = '42501'; end if;
  select * into r from public.riders where id = rider and workspace_id = ws and status in ('draft', 'sent');
  if not found then raise exception 'That rider is not waiting for a signature.'; end if;
  update public.riders set is_current = false, status = 'superseded'
   where is_current and ((r.agent_id is not null and agent_id = r.agent_id) or (r.team_id is not null and team_id = r.team_id));
  update public.riders set status = 'signed', is_current = true, signed_at = now(), signed_name = trim(signer),
         signature_note = 'Recorded by staff' where id = rider;
  if r.agent_id is not null then
    perform set_config('kinu.trusted', 'on', true);
    update public.agents set rider_status = 'signed' where id = r.agent_id;
    update public.deal_agents da set split_pct = da.split_pct
      from public.deals d where d.id = da.deal_id and da.agent_id = r.agent_id and d.status in ('open', 'held', 'cleared');
  end if;
end;
$$;

create or replace function public.decide_tier(ws uuid, approval uuid, decision text)
returns void language plpgsql security definer set search_path = '' as $$
declare t record; cur record; new_rider uuid;
begin
  if not private.has_cap(ws, 'tiers.approve') then raise exception 'You are not allowed to approve tiers.' using errcode = '42501'; end if;
  select * into t from public.tier_approvals where id = approval and workspace_id = ws for update;
  if not found then raise exception 'No such approval.'; end if;

  if decision = 'approve' then
    if t.status = 'approved' then raise exception 'Already approved.'; end if;
    select * into cur from public.riders r
     where r.is_current and ((t.agent_id is not null and r.agent_id = t.agent_id) or (t.team_id is not null and r.team_id = t.team_id));
    new_rider := private.make_rider(ws, t.agent_id, t.team_id, t.to_pct, coalesce(cur.tiers, '[]'), 'signed',
                                    'Tier approval. Drafted for e-signature.');
    update public.tier_approvals set status = 'approved', rider_from_id = cur.id, rider_to_id = new_rider,
           decided_by = (select auth.uid()), decided_at = now() where id = approval;
    perform private.log(ws, 'approve', 'tier', approval::text,
      format('Approved %s: %s%% to %s%%', t.subject_name, t.from_pct, t.to_pct));
  elsif decision = 'undo' then
    if t.status <> 'approved' then raise exception 'Only an approved tier can be undone.'; end if;
    update public.riders set is_current = false, status = 'void' where id = t.rider_to_id;
    if t.rider_from_id is not null then
      update public.riders set is_current = true, status = 'signed' where id = t.rider_from_id;
    end if;
    update public.tier_approvals set status = 'waiting', rider_to_id = null, decided_by = (select auth.uid()), decided_at = now()
     where id = approval;
    perform private.log(ws, 'undo', 'tier', approval::text,
      format('Undid approval for %s; rider restored to %s%%', t.subject_name, t.from_pct));
  elsif decision = 'hold' then
    if t.status = 'approved' then raise exception 'Undo the approval first.'; end if;
    update public.tier_approvals set status = 'held', decided_by = (select auth.uid()), decided_at = now() where id = approval;
    perform private.log(ws, 'hold', 'tier', approval::text, format('Held tier move for %s for review', t.subject_name));
  elsif decision = 'reopen' then
    update public.tier_approvals set status = 'waiting' where id = approval and status = 'held';
  else
    raise exception 'unknown decision';
  end if;

  -- Re-check every open deal line this touches.
  update public.deal_agents da set split_pct = da.split_pct
    from public.deals d
   where d.id = da.deal_id and d.status in ('open', 'held', 'cleared')
     and (da.agent_id = t.agent_id
          or (t.team_id is not null and da.agent_id in (select tm.agent_id from public.team_members tm where tm.team_id = t.team_id)));
end;
$$;

-- "Push through at the current rider": correct the line to what the rider says.
create or replace function public.push_through(ws uuid, line uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare l record;
begin
  if not private.has_cap(ws, 'deals.edit') then raise exception 'not allowed' using errcode = '42501'; end if;
  select * into l from public.deal_agents where id = line and workspace_id = ws;
  if not found or l.rider_pct is null then raise exception 'There is no rider to fall back on.'; end if;
  update public.deal_agents set split_pct = l.rider_pct where id = line;
  perform private.log(ws, 'push_through', 'deal_agents', line::text,
    format('Paid at the current rider (%s%%) instead of %s%%', l.rider_pct, l.split_pct));
end;
$$;

-- An override: one sign-off by someone with the power, a reason from a short
-- list, and a note. Always logged.
create or replace function public.override_line(ws uuid, line uuid, reason text, note text)
returns void language plpgsql security definer set search_path = '' as $$
declare l record;
begin
  if not private.has_cap(ws, 'override') then raise exception 'You do not have the override power.' using errcode = '42501'; end if;
  if reason not in ('signed_amendment_pending', 'broker_approved_exception', 'data_entry_correction', 'legacy_agreement') then
    raise exception 'Pick a reason from the list.'; end if;
  if char_length(trim(coalesce(note, ''))) < 10 then raise exception 'Add a note of at least 10 characters.'; end if;
  select * into l from public.deal_agents where id = line and workspace_id = ws;
  if not found then raise exception 'No such line.'; end if;
  perform set_config('kinu.override', 'on', true);
  update public.deal_agents set check_status = 'overridden', check_reason = 'Overridden by ' || private.actor_label(),
         override_reason = reason, override_note = trim(note) where id = line;
  perform set_config('kinu.override', 'off', true);
  perform private.log(ws, 'override', 'deal_agents', line::text,
    format('Override: %s%% kept against a %s%% rider', l.split_pct, l.rider_pct),
    jsonb_build_object('reason', reason, 'note', trim(note)));
end;
$$;

-- -------------------------------------------------------------- payroll --

create or replace function public.open_payroll(ws uuid, pay date)
returns uuid language plpgsql security definer set search_path = '' as $$
declare out_id uuid; w record;
begin
  if not private.has_cap(ws, 'payroll.manage') then raise exception 'not allowed' using errcode = '42501'; end if;
  select * into w from public.workspaces where id = ws;
  insert into public.payrolls (workspace_id, pay_date, cutoff_at)
  values (ws, pay, ((pay::text || ' ' || w.cutoff_time::text)::timestamp at time zone w.timezone))
  on conflict (workspace_id, pay_date) do update set pay_date = excluded.pay_date
  returning id into out_id;
  return out_id;
end;
$$;

-- Cutoff: cleared deals go into this payroll. Everything else stays out, and
-- open deals are moved to the held folder with the reason they missed it.
create or replace function public.run_cutoff(ws uuid, payroll uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare p record; taken integer; held integer;
begin
  if not private.has_cap(ws, 'payroll.manage') then raise exception 'not allowed' using errcode = '42501'; end if;
  select * into p from public.payrolls where id = payroll and workspace_id = ws for update;
  if not found or p.status <> 'open' then raise exception 'This payroll is not open.'; end if;
  perform set_config('kinu.payroll', 'on', true);
  update public.deals set status = 'processed', payroll_id = payroll, updated_at = now()
   where workspace_id = ws and status = 'cleared';
  get diagnostics taken = row_count;
  update public.deals set status = 'held', held_reason = 'Not cleared by cutoff for ' || to_char(p.pay_date, 'Dy DD Mon'), updated_at = now()
   where workspace_id = ws and status = 'open' and deposit_date is not null and deposit_date <= p.pay_date;
  get diagnostics held = row_count;
  update public.payrolls set status = 'cutoff' where id = payroll;
  perform set_config('kinu.payroll', 'off', true);
  perform private.log(ws, 'cutoff', 'payrolls', payroll::text, format('Cutoff run: %s deals in, %s held', taken, held));
  return jsonb_build_object('processed', taken, 'held', held);
end;
$$;

-- Finance can still push a cleared deal into a payroll on payroll day.
create or replace function public.add_to_payroll(ws uuid, payroll uuid, deal uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not private.has_cap(ws, 'payroll.manage') then raise exception 'not allowed' using errcode = '42501'; end if;
  if not exists (select 1 from public.payrolls where id = payroll and workspace_id = ws and status in ('open', 'cutoff')) then
    raise exception 'That payroll is already released.'; end if;
  if exists (select 1 from public.deal_agents da where da.deal_id = deal and da.check_status in ('incorrect', 'needs_approval')) then
    raise exception 'A split on this deal does not match the rider.'; end if;
  perform set_config('kinu.payroll', 'on', true);
  update public.deals set status = 'processed', payroll_id = payroll, held_reason = null, updated_at = now()
   where id = deal and workspace_id = ws and status in ('cleared', 'held');
  if not found then raise exception 'Only a cleared or held deal can be added.'; end if;
  perform set_config('kinu.payroll', 'off', true);
  perform private.log(ws, 'add_to_payroll', 'deals', deal::text, 'Added to payroll by hand');
end;
$$;

-- Releasing a payroll is a big power. Kinu never moves money: this records
-- the decision; finance pays through its own systems.
create or replace function public.release_payroll(ws uuid, payroll uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not private.has_cap(ws, 'payroll.release') then raise exception 'You do not have the power to release payroll.' using errcode = '42501'; end if;
  if exists (select 1 from public.deals d join public.deal_agents da on da.deal_id = d.id
              where d.payroll_id = payroll and da.check_status in ('incorrect', 'needs_approval')) then
    raise exception 'A payout in this payroll does not match its rider.'; end if;
  update public.payrolls set status = 'released', released_by = (select auth.uid()), released_at = now()
   where id = payroll and workspace_id = ws and status = 'cutoff';
  if not found then raise exception 'Run the cutoff first.'; end if;
  perform private.log(ws, 'release', 'payrolls', payroll::text, 'Payroll released');
end;
$$;

create or replace function public.close_payroll(ws uuid, payroll uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not private.has_cap(ws, 'payroll.manage') then raise exception 'not allowed' using errcode = '42501'; end if;
  update public.payrolls set status = 'closed', closed_at = now() where id = payroll and workspace_id = ws and status = 'released';
  if not found then raise exception 'Release the payroll before closing it.'; end if;
  perform set_config('kinu.payroll', 'on', true);
  update public.deals set status = 'closed', waiting_on = 'nobody', updated_at = now() where payroll_id = payroll and status = 'processed';
  -- Closed deals count towards each agent's commission for the year.
  perform set_config('kinu.trusted', 'on', true);
  update public.agents a set gci_ytd = a.gci_ytd + s.total
    from (select da.agent_id, sum(d.net * da.share_pct / 100) as total
            from public.deal_agents da join public.deals d on d.id = da.deal_id
           where d.payroll_id = payroll group by da.agent_id) s
   where a.id = s.agent_id;
  perform set_config('kinu.payroll', 'off', true);
  perform private.log(ws, 'close', 'payrolls', payroll::text, 'Payroll closed');
end;
$$;

-- Record a payment and how it is split across deals. Matching is by deal
-- (address), never by amount alone. The explanation line writes itself.
create or replace function public.record_payment(
  ws uuid, pay_method text, pay_amount numeric, pay_date date, pay_reference text, allocations jsonb, proof text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare out_id uuid; total numeric; a jsonb; line text := '';
begin
  if not private.has_cap(ws, 'payments.manage') then raise exception 'not allowed' using errcode = '42501'; end if;
  if jsonb_typeof(allocations) <> 'array' or jsonb_array_length(allocations) = 0 then raise exception 'Choose at least one deal.'; end if;
  select sum((x ->> 'amount')::numeric) into total from jsonb_array_elements(allocations) x;
  if total <> pay_amount then raise exception 'The parts add up to % but the payment is %.', total, pay_amount; end if;

  insert into public.payments (workspace_id, method, amount, received_on, reference, proof_path, created_by)
  values (ws, pay_method, pay_amount, pay_date, nullif(trim(pay_reference), ''), proof, (select auth.uid()))
  returning id into out_id;

  for a in select * from jsonb_array_elements(allocations) loop
    insert into public.payment_allocations (payment_id, deal_id, workspace_id, amount)
    values (out_id, (a ->> 'deal_id')::uuid, ws, (a ->> 'amount')::numeric);
  end loop;

  select string_agg(
           case when rn = 1 then d.address || ' ($' || to_char(pa.amount, 'FM999,999,990.00') || ')'
                else 'Other ($' || to_char(pa.amount, 'FM999,999,990.00') || ')' end, '; ' order by rn)
    into line
    from (select pa.*, row_number() over (order by pa.amount desc) rn from public.payment_allocations pa where pa.payment_id = out_id) pa
    join public.deals d on d.id = pa.deal_id;
  update public.payments set explanation = line where id = out_id;
  return out_id;
end;
$$;

-- "Is this a dual?" Same address already on file in this brokerage.
create or replace function public.find_duplicates(ws uuid, deal_address text, skip uuid default null)
returns table (id uuid, address text, deal_type text, status text, gci numeric)
language sql stable security definer set search_path = '' as $$
  select d.id, d.address, d.deal_type, d.status, d.gci
    from public.deals d
   where d.workspace_id = ws and private.has_cap(ws, 'deals.view')
     and lower(regexp_replace(d.address, '[^a-zA-Z0-9]', '', 'g')) = lower(regexp_replace(deal_address, '[^a-zA-Z0-9]', '', 'g'))
     and (skip is null or d.id <> skip);
$$;

-- Agents close to (or past) their next tier, from closed commission.
create or replace function private.tiers_due(ws uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare r record; tier jsonb;
begin
  for r in select a.id, a.full_name, a.gci_ytd, rd.split_pct, rd.tiers
             from public.agents a join public.riders rd on rd.agent_id = a.id and rd.is_current
            where a.workspace_id = ws loop
    for tier in select * from jsonb_array_elements(r.tiers) loop
      if (tier ->> 'pct')::numeric > r.split_pct and r.gci_ytd >= (tier ->> 'from')::numeric
         and not exists (select 1 from public.tier_approvals t where t.agent_id = r.id and t.to_pct = (tier ->> 'pct')::numeric) then
        insert into public.tier_approvals (workspace_id, subject_kind, subject_name, reason, from_pct, to_pct, status, agent_id, position)
        values (ws, 'agent', r.full_name, 'crossed $' || to_char((tier ->> 'from')::numeric, 'FM999,999,990') || ' GCI',
                r.split_pct, (tier ->> 'pct')::numeric, 'waiting', r.id, 0);
      end if;
    end loop;
  end loop;
end;
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'public.draft_rider(uuid, uuid, uuid, numeric, jsonb)', 'public.mark_rider_signed(uuid, uuid, text)',
    'public.decide_tier(uuid, uuid, text)', 'public.push_through(uuid, uuid)',
    'public.override_line(uuid, uuid, text, text)', 'public.open_payroll(uuid, date)',
    'public.run_cutoff(uuid, uuid)', 'public.add_to_payroll(uuid, uuid, uuid)',
    'public.release_payroll(uuid, uuid)', 'public.close_payroll(uuid, uuid)',
    'public.record_payment(uuid, text, numeric, date, text, jsonb, text)',
    'public.find_duplicates(uuid, text, uuid)'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

-- Kinu: FAKE sample data for the TEST project.
-- Every person, licence fragment, address and dollar figure is invented.
-- Safe to run more than once: it rebuilds the two sample brokerages each time.
--
-- Run this AFTER adding your own user (Authentication -> Users):
--   * the first user ever created becomes Kinu staff (the platform admin),
--   * every existing user becomes an owner of the main sample brokerage.

begin;

-- Sample data is loaded as the system, past the hand-entry rules.
select set_config('kinu.trusted', 'on', true), set_config('kinu.payroll', 'on', true), set_config('kinu.actor', 'Sample data', true);

delete from public.workspaces where id in ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002');

insert into public.workspaces (id, name, timezone, has_ops, has_finance, addons, reply_alias)
values
  ('00000000-0000-4000-8000-000000000001', 'Sample Brokerage (fake data)', 'America/New_York', true, true,
   array['retention','finance_shield','compliance'], 'payroll@sample-brokerage.test'),
  ('00000000-0000-4000-8000-000000000002', 'Harbor & Vine Realty (fake data)', 'America/New_York', true, false,
   array[]::text[], null);

insert into public.offices (id, workspace_id, name) values
  ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-000000000001', 'Manhattan'),
  ('00000000-0000-4000-8000-0000000000a2', '00000000-0000-4000-8000-000000000001', 'Brooklyn'),
  ('00000000-0000-4000-8000-0000000000a3', '00000000-0000-4000-8000-000000000001', 'Queens'),
  ('00000000-0000-4000-8000-0000000000a4', '00000000-0000-4000-8000-000000000001', 'Westchester'),
  ('00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-000000000002', 'Main office');

-- ----------------------------------------------------------------- agents --
create temporary table seed_agents (
  full_name text, office text, team_label text, cohort text, pos integer, lic text, lic_status text, lic_note text,
  w9 text, rider text, onboarding text, gci numeric, chg integer, split numeric, status text
) on commit drop;

insert into seed_agents values
  ('Daniela Ruiz',   'Manhattan · UES',         null,                   null, null, '10401 ••• 441', 'verified', null, 'received', 'signed', 'ready', 361500, 9, 85, 'active'),
  ('Marcus Hale',    'Westchester · Rye',       'Hale Group · lead',    null, null, '10401 ••• 615', 'verified', null, 'received', 'signed', 'ready', 344900, 21, 85, 'active'),
  ('Aisha Bello',    'Brooklyn · Williamsburg', null,                   null, null, '10401 ••• 129', 'verified', null, 'received', 'signed', 'ready', 327300, 6, 80, 'active'),
  ('Kenji Nakamura', 'Queens · LIC',            'Team Nakamura · lead', null, null, '10401 ••• 870', 'verified', null, 'received', 'signed', 'ready', 301750, -3, 75, 'active'),
  ('Sofia Marino',   'Manhattan · Tribeca',     null,                   null, null, '10401 ••• 233', 'verified', null, 'received', 'signed', 'ready', 288400, 4, 80, 'active'),
  ('Grace Kim',      'Manhattan · SoHo',        null,                   null, null, '10401 ••• 506', 'verified', null, 'received', 'signed', 'ready', 244100, -2, 80, 'active'),
  ('Owen Price',     'Westchester · Scarsdale', null,                   null, null, '10401 ••• 784', 'verified', null, 'received', 'signed', 'ready', 229600, 7, 75, 'active'),
  ('Nia Carter',     'Brooklyn · Park Slope',   'Team Ellis',           null, null, '10401 ••• 392', 'verified', null, 'received', 'signed', 'ready', 118200, 5, 75, 'active'),
  ('Ana Ruiz',       'Brooklyn · Park Slope',   'Team Ellis',           null, null, '10401 ••• 118', 'verified', null, 'received', 'signed', 'ready', 64300, 3, 70, 'active'),
  ('Leo Grant',      'Brooklyn · Park Slope',   'Team Ellis',           null, null, '10401 ••• 951', 'verified', null, 'received', 'signed', 'ready', 51900, 2, 70, 'active'),
  ('Iris Wong',      'Brooklyn · Park Slope',   'Team Ellis',           null, null, '10401 ••• 274', 'verified', null, 'received', 'signed', 'ready', 47800, 8, 70, 'active'),
  ('Ben Shah',       'Queens · LIC',            'Team Nakamura',        null, null, '10401 ••• 633', 'verified', null, 'received', 'signed', 'ready', 92400, 1, 70, 'active'),
  ('Maya Chen',    'Manhattan · SoHo',        null,                '2026-11', 1, '10401 ••• 338', 'verified',     null,                 'received',      'signed',   'ready',       412800, 18, 80, 'active'),
  ('Jordan Ellis', 'Brooklyn · Park Slope',   'Team Ellis · lead', '2026-11', 2, '10401 ••• 058', 'verified',     null,                 'received',      'signed',   'ready',       398200, 12, 80, 'active'),
  ('Rosa Alvarez', 'Manhattan · UES',         null,                '2026-11', 3, '10401 ••• 312', 'mismatch',     'number mismatch',    'received',      'sent',     'flagged',     0, null, 70, 'flagged'),
  ('Theo Brooks',  'Queens · Astoria',        'Team Ellis',        '2026-11', 4, '10401 ••• 914', 'verified',     null,                 'name_mismatch', 'signed',   'flagged',     261900, 11, 75, 'flagged'),
  ('Priya Nair',   'Manhattan · SoHo',        null,                '2026-11', 5, '10401 ••• 772', 'verified',     null,                 'pending',       'not_sent', 'in_progress', 0, null, 70, 'onboarding'),
  ('Kwame Osei',   'Brooklyn · Williamsburg', null,                '2026-11', 6, '10401 ••• 660', 'expiring',     'expires in 21 days', 'received',      'signed',   'flagged',     0, null, 80, 'flagged'),
  ('Lena Park',    'Westchester · Rye',       null,                '2026-11', 7, null,            'not_uploaded', 'not uploaded',       'pending',       'not_sent', 'in_progress', 0, null, 70, 'onboarding'),
  ('Sam Okafor',   'Manhattan · SoHo',        'Team Ellis',        '2026-11', 8, '10401 ••• 207', 'verified',     null,                 'received',      'signed',   'ready',       0, null, 75, 'active');

-- The other 42 invented agents of the November cohort.
insert into seed_agents
select n.full_name,
  (array['Manhattan · SoHo', 'Brooklyn · Park Slope', 'Manhattan · UES', 'Queens · Astoria',
         'Brooklyn · Williamsburg', 'Westchester · Rye', 'Manhattan · Tribeca', 'Queens · LIC'])[1 + (n.i % 8)],
  null, '2026-11', 8 + n.i,
  case when n.i > 39 then null else '10401 ••• ' || lpad(((n.i * 37 + 101) % 1000)::text, 3, '0') end,
  case when n.i > 39 then 'not_uploaded' else 'verified' end,
  case when n.i > 39 then 'not uploaded' else null end,
  case when n.i > 35 then 'pending' else 'received' end,
  case when n.i > 35 then 'not_sent' else 'signed' end,
  case when n.i > 35 then 'in_progress' else 'ready' end,
  0, null, 70,
  case when n.i > 35 then 'onboarding' else 'active' end
from unnest(array[
  'Amara Diallo', 'Ben Whitfield', 'Carla Mendes', 'Dev Kapoor', 'Elena Sokolova', 'Felix Tran',
  'Gia Romano', 'Hassan Qureshi', 'Ines Duarte', 'Jonah Feldman', 'Keiko Mori', 'Liam Gallagher-Reyes',
  'Mina Haddad', 'Noel Baptiste', 'Olive Tanaka', 'Pablo Serrano', 'Quinn Abara', 'Rhea Malhotra',
  'Silas Greer', 'Tessa Lindqvist', 'Umar Farouk', 'Vera Novak', 'Wes Calloway', 'Ximena Ortega',
  'Yusuf Demir', 'Zoe Hartley', 'Anton Vasquez', 'Bianca Okoye', 'Caleb Stroud', 'Dalia Rahimi',
  'Emeka Nwosu', 'Freya Larsen', 'Gabe Montero', 'Hana Yoshida', 'Ivo Petrov',
  'Jada Sinclair', 'Kofi Mensah', 'Lucia Ferrante', 'Mateo Cruz',
  'Nadia Boucher', 'Oscar Lindholm', 'Pia Venter'
]) with ordinality as n (full_name, i);

insert into public.agents
  (workspace_id, full_name, email, phone, office, office_id, team_label, cohort, cohort_position, licence_masked,
   licence_status, licence_note, licence_expires_on, w9_status, rider_status, onboarding_status, gci_ytd, gci_change_pct,
   status, joined_on, details_done_at)
select '00000000-0000-4000-8000-000000000001', s.full_name,
  lower(replace(replace(s.full_name, ' ', '.'), '''', '')) || '@agents.sample-brokerage.test',
  '(212) 555-01' || lpad((row_number() over (order by s.full_name) % 100)::text, 2, '0'),
  s.office,
  (select o.id from public.offices o where o.workspace_id = '00000000-0000-4000-8000-000000000001' and o.name = split_part(s.office, ' · ', 1)),
  s.team_label, s.cohort, s.pos, s.lic, s.lic_status, s.lic_note,
  case when s.full_name = 'Kwame Osei' then current_date + 21
       when s.full_name = 'Grace Kim' then current_date + 38
       when s.full_name = 'Owen Price' then current_date + 55
       when s.full_name = 'Sofia Marino' then current_date + 71
       when s.full_name = 'Ben Shah' then current_date + 84
       when s.lic is not null then current_date + 200 + (length(s.full_name) * 23) end,
  s.w9, s.rider, s.onboarding, s.gci, s.chg, s.status,
  case when s.cohort is null then date '2024-03-04' else date '2026-11-03' end,
  case when s.onboarding <> 'in_progress' or s.lic is not null then now() - interval '9 days' end
from seed_agents s;

-- Tax records (last four digits only) for everyone whose W-9 is in.
insert into public.agent_tax (agent_id, workspace_id, legal_name, tin_last4, provider_ref, received_at)
select a.id, a.workspace_id,
  case when a.full_name = 'Theo Brooks' then 'Theodore Brooks' else a.full_name end,
  lpad(((length(a.full_name) * 7919) % 10000)::text, 4, '0'),
  'w9_sample_' || substr(a.id::text, 1, 8), now() - interval '8 days'
from public.agents a
where a.workspace_id = '00000000-0000-4000-8000-000000000001' and a.w9_status <> 'pending';

-- Teams, with who reports to whom.
insert into public.teams (id, workspace_id, name, lead_agent_id)
select t.id::uuid, '00000000-0000-4000-8000-000000000001', t.name,
       (select a.id from public.agents a where a.workspace_id = '00000000-0000-4000-8000-000000000001' and a.full_name = t.lead)
from (values
  ('00000000-0000-4000-8000-0000000000c1', 'Team Ellis', 'Jordan Ellis'),
  ('00000000-0000-4000-8000-0000000000c2', 'Team Nakamura', 'Kenji Nakamura'),
  ('00000000-0000-4000-8000-0000000000c3', 'Hale Group', 'Marcus Hale')) as t (id, name, lead);

insert into public.team_members (team_id, agent_id, workspace_id, parent_agent_id, role_label)
select t.id, a.id, t.workspace_id, p.id, m.label
from (values
  ('Team Ellis', 'Jordan Ellis', null, 'Team lead'), ('Team Ellis', 'Theo Brooks', 'Jordan Ellis', 'Sub-lead'),
  ('Team Ellis', 'Nia Carter', 'Jordan Ellis', 'Sub-lead'), ('Team Ellis', 'Sam Okafor', 'Theo Brooks', 'Member'),
  ('Team Ellis', 'Ana Ruiz', 'Theo Brooks', 'Member'), ('Team Ellis', 'Leo Grant', 'Nia Carter', 'Member'),
  ('Team Ellis', 'Iris Wong', 'Nia Carter', 'Member'),
  ('Team Nakamura', 'Kenji Nakamura', null, 'Team lead'), ('Team Nakamura', 'Ben Shah', 'Kenji Nakamura', 'Member'),
  ('Hale Group', 'Marcus Hale', null, 'Team lead'), ('Hale Group', 'Owen Price', 'Marcus Hale', 'Member')
) as m (team, agent, parent, label)
join public.teams t on t.name = m.team and t.workspace_id = '00000000-0000-4000-8000-000000000001'
join public.agents a on a.full_name = m.agent and a.workspace_id = t.workspace_id
left join public.agents p on p.full_name = m.parent and p.workspace_id = t.workspace_id;

-- Riders: every agent whose rider is signed has a current one, with tiers.
insert into public.riders (workspace_id, agent_id, version, split_pct, tiers, status, is_current, signed_name, signed_at, signed_consent, signature_note)
select a.workspace_id, a.id, 2, s.split,
  jsonb_build_array(
    jsonb_build_object('from', 0, 'to', 20000, 'pct', 70),
    jsonb_build_object('from', 20000, 'to', 40000, 'pct', 80),
    jsonb_build_object('from', 40000, 'to', null, 'pct', 85)),
  'signed', true, a.full_name, now() - interval '12 days', true, 'E-signature · sample'
from public.agents a join seed_agents s on s.full_name = a.full_name
where a.workspace_id = '00000000-0000-4000-8000-000000000001' and a.rider_status = 'signed';

insert into public.riders (workspace_id, agent_id, version, split_pct, tiers, status, is_current)
select a.workspace_id, a.id, 1, 70, '[{"from":0,"to":20000,"pct":70},{"from":20000,"to":40000,"pct":80},{"from":40000,"to":null,"pct":85}]', 'sent', false
from public.agents a where a.workspace_id = '00000000-0000-4000-8000-000000000001' and a.rider_status = 'sent';

insert into public.riders (workspace_id, team_id, version, split_pct, tiers, status, is_current, signed_name, signed_at, signed_consent, signature_note)
values
  ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000c1', 1, 75, '[{"from":0,"to":1250000,"pct":75},{"from":1250000,"to":null,"pct":78}]', 'signed', true, 'Jordan Ellis', now() - interval '40 days', true, 'E-signature · sample'),
  ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000c2', 1, 75, '[]', 'signed', true, 'Kenji Nakamura', now() - interval '60 days', true, 'E-signature · sample'),
  ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-0000000000c3', 1, 78, '[]', 'signed', true, 'Marcus Hale', now() - interval '75 days', true, 'E-signature · sample');

insert into public.tier_approvals (workspace_id, subject_kind, subject_name, reason, from_pct, to_pct, status, position, agent_id, team_id)
select '00000000-0000-4000-8000-000000000001', v.kind, v.name, v.reason, v.f, v.t, v.status, v.pos,
  (select a.id from public.agents a where a.workspace_id = '00000000-0000-4000-8000-000000000001' and a.full_name = v.name and v.kind = 'agent'),
  (select t.id from public.teams t where t.workspace_id = '00000000-0000-4000-8000-000000000001' and t.name = v.name and v.kind = 'team')
from (values
  ('agent', 'Maya Chen',   'crossed $40,000 GCI',       80, 85, 'waiting', 1),
  ('team',  'Team Ellis',  'crossed $250,000 team GCI', 75, 78, 'waiting', 2),
  ('agent', 'Marcus Hale', 'crossed $80,000 GCI',       85, 90, 'waiting', 3)
) as v (kind, name, reason, f, t, status, pos);

insert into public.onboarding_batches (workspace_id, sent_at, sent_count, ready_count, ready_timeline)
values
  ('00000000-0000-4000-8000-000000000001', '2026-11-14 14:05:00-05', 50, 38, array[2, 4, 6, 5, 7, 4, 3, 2, 2, 1, 1, 1]),
  ('00000000-0000-4000-8000-000000000001', '2026-11-10 10:30:00-05', 26, 21, null),
  ('00000000-0000-4000-8000-000000000001', '2026-11-07 09:15:00-05', 15, 15, null);

insert into public.attention_items (workspace_id, agent_id, tag, detail, position)
select a.workspace_id, a.id, v.tag, v.detail, v.position
from (values
  ('Rosa Alvarez', 'Licence',  'Photo reads 10401 ••• 312, state record says ••• 321', 1),
  ('Theo Brooks',  'W-9',      '“Theodore Brooks” on W-9, “Theo Brooks” on licence', 2),
  ('Kwame Osei',   'Expiring', 'Licence expires in 21 days · renewal reminder sent', 3)
) as v (full_name, tag, detail, position)
join public.agents a on a.full_name = v.full_name and a.workspace_id = '00000000-0000-4000-8000-000000000001';

-- File records (the cabinets). Sample records have no stored file behind them.
insert into public.documents (workspace_id, agent_id, kind, filename, status, note, created_at)
select a.workspace_id, a.id, 'licence', a.full_name || ' · licence.jpg',
  case a.licence_status when 'verified' then 'verified' when 'mismatch' then 'check' else 'expiring' end,
  case a.licence_status when 'verified' then 'Matched to state record' when 'mismatch' then 'Number mismatch · ••• 312 vs ••• 321' else 'Expires in 21 days' end,
  now() - interval '9 days'
from public.agents a where a.workspace_id = '00000000-0000-4000-8000-000000000001' and a.licence_status <> 'not_uploaded';
insert into public.documents (workspace_id, agent_id, kind, filename, status, note, created_at)
select a.workspace_id, a.id, 'w9', a.full_name || ' · W-9 (held by W-9 service)', 'on_file', 'TIN on file · masked', now() - interval '8 days'
from public.agents a where a.workspace_id = '00000000-0000-4000-8000-000000000001' and a.w9_status <> 'pending';
insert into public.documents (workspace_id, agent_id, kind, filename, status, note, created_at)
select a.workspace_id, a.id, 'rider', a.full_name || ' · individual rider v2.pdf', 'signed', 'E-signature · certificate attached', now() - interval '12 days'
from public.agents a where a.workspace_id = '00000000-0000-4000-8000-000000000001' and a.rider_status = 'signed';
insert into public.documents (workspace_id, agent_id, kind, filename, status, note, created_at)
select a.workspace_id, a.id, 'agreement', a.full_name || ' · contractor agreement.pdf', 'signed', 'Signed at onboarding', now() - interval '12 days'
from public.agents a where a.workspace_id = '00000000-0000-4000-8000-000000000001' and a.onboarding_status = 'ready';

-- ---------------------------------------------------------------- finance --
insert into public.payrolls (id, workspace_id, pay_date, cutoff_at, status, released_at, closed_at) values
  ('00000000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-000000000001', current_date - 7, (current_date - 7) + time '08:30', 'closed', now() - interval '7 days', now() - interval '7 days'),
  ('00000000-0000-4000-8000-0000000000d2', '00000000-0000-4000-8000-000000000001', current_date - 3, (current_date - 3) + time '08:30', 'closed', now() - interval '3 days', now() - interval '3 days'),
  ('00000000-0000-4000-8000-0000000000d3', '00000000-0000-4000-8000-000000000001', current_date + 1, (current_date + 1) + time '08:30', 'open', null, null);

create temporary table seed_deals (
  n integer, address text, kind text, gci numeric, dep integer, status text, payroll text, held text, waiting text,
  pp text, parties jsonb, office text
) on commit drop;
insert into seed_deals values
  (1,  '245 Elm St, #4B',        'tenant',       14250, -9, 'closed',    'd1', null, 'nobody', 'PP-70311', '[{"kind":"tenant","name":"R. Whitlock"},{"kind":"landlord","name":"Elm Street Holdings"}]', 'Brooklyn'),
  (2,  '18 Pine Ave',            'seller',       22800, -8, 'closed',    'd1', null, 'nobody', 'PP-70312', '[{"kind":"seller","name":"The Okonkwo Family"}]', 'Brooklyn'),
  (3,  '77 Bay Rd',              'buyer',        19200, -5, 'closed',    'd2', null, 'nobody', 'PP-70318', '[{"kind":"buyer","name":"D. Lindgren"}]', 'Manhattan'),
  (4,  '9 Hill Ct, #2',          'landlord',     11400, -4, 'closed',    'd2', null, 'nobody', 'PP-70319', '[{"kind":"landlord","name":"Hill Court LLC"}]', 'Brooklyn'),
  (5,  '410 Mercer St, PH',      'seller',       48600, -2, 'cleared',   null, null, 'nobody', 'PP-70324', '[{"kind":"seller","name":"M. Castellane"}]', 'Manhattan'),
  (6,  '52 Kent Ave, #7C',       'tenant',        6900, -2, 'cleared',   null, null, 'nobody', 'PP-70325', '[{"kind":"tenant","name":"J. Abernathy"}]', 'Brooklyn'),
  (7,  '1208 Vernon Blvd',       'buyer',        17750, -1, 'open',      null, null, 'finance', 'PP-70327', '[{"kind":"buyer","name":"The Ferreira Family"}]', 'Queens'),
  (8,  '33 Greene St, #5',       'landlord',      8200, -1, 'open',      null, null, 'agent', 'PP-70328', '[{"kind":"landlord","name":"Greene 33 Associates"}]', 'Manhattan'),
  (9,  '140 Purchase St',        'seller',       31500, -1, 'open',      null, null, 'finance', 'PP-70329', '[{"kind":"seller","name":"P. Hargrove"}]', 'Westchester'),
  (10, '88 Wythe Ave, #3A',      'dual',         12400,  0, 'open',      null, null, 'finance', 'PP-70331', '[{"kind":"landlord","name":"Wythe Partners"},{"kind":"tenant","name":"S. Okoro"}]', 'Brooklyn'),
  (11, '5 Tudor City Pl, #1104', 'tenant',        5400, -6, 'held',      null, 'Check not yet settled', 'finance', 'PP-70315', '[{"kind":"tenant","name":"L. Marchetti"}]', 'Manhattan'),
  (12, '27-10 Astoria Blvd',     'landlord',      7300, -6, 'held',      null, 'Notice of contract missing from Dotloop', 'agent', 'PP-70316', '[{"kind":"landlord","name":"Astoria 27 Realty"}]', 'Queens'),
  (13, '300 E 71st St, #9D',     'referral',      4000, -1, 'open',      null, null, 'finance', 'PP-70332', '[{"kind":"buyer","name":"Referred out"}]', 'Manhattan'),
  (14, '61 Jane St, #2F',        'pass_through',  2500,  0, 'open',      null, null, 'finance', 'PP-70333', '[{"kind":"tenant","name":"K. Sorensen"}]', 'Manhattan');

insert into public.deals (id, workspace_id, office_id, address, deal_type, gci, deposit_date, status, payroll_id, held_reason, waiting_on, pp_number, parties, created_at)
select ('00000000-0000-4000-8000-00000000e' || lpad(s.n::text, 3, '0'))::uuid, '00000000-0000-4000-8000-000000000001',
  (select o.id from public.offices o where o.workspace_id = '00000000-0000-4000-8000-000000000001' and o.name = s.office),
  s.address, s.kind, s.gci, current_date + s.dep, s.status,
  case s.payroll when 'd1' then '00000000-0000-4000-8000-0000000000d1'::uuid when 'd2' then '00000000-0000-4000-8000-0000000000d2'::uuid end,
  s.held, s.waiting, s.pp, s.parties, now() + (s.dep - 2) * interval '1 day'
from seed_deals s;

insert into public.deal_fees (deal_id, workspace_id, kind, payee, amount) values
  ('00000000-0000-4000-8000-00000000e005', '00000000-0000-4000-8000-000000000001', 'referral', 'Coastal Referral Network', 4860),
  ('00000000-0000-4000-8000-00000000e009', '00000000-0000-4000-8000-000000000001', 'outside', 'Rye & Partners (co-broke)', 3150),
  ('00000000-0000-4000-8000-00000000e013', '00000000-0000-4000-8000-000000000001', 'referral', 'Northgate Relocation', 3000);

-- Agent lines. The rider check and every payout are worked out by the database.
insert into public.deal_agents (deal_id, workspace_id, agent_id, basis, share_pct, split_pct)
select ('00000000-0000-4000-8000-00000000e' || lpad(v.n::text, 3, '0'))::uuid, a.workspace_id, a.id, v.basis, v.share, v.split
from (values
  (1, 'Jordan Ellis', 'individual', 100, 80), (2, 'Jordan Ellis', 'team', 100, 75),
  (3, 'Jordan Ellis', 'individual', 50, 80), (3, 'Maya Chen', 'individual', 50, 80),
  (4, 'Jordan Ellis', 'team', 100, 75),
  (5, 'Maya Chen', 'individual', 100, 85),          -- 85% entered, rider is 80%: tier approval waiting
  (6, 'Aisha Bello', 'individual', 100, 80),
  (7, 'Kenji Nakamura', 'individual', 100, 78),     -- 78% entered, rider is 75%: incorrect
  (8, 'Grace Kim', 'individual', 100, 80),
  (9, 'Marcus Hale', 'individual', 60, 85), (9, 'Owen Price', 'individual', 40, 75),
  (10, 'Aisha Bello', 'individual', 50, 80), (10, 'Kwame Osei', 'individual', 50, 80),
  (11, 'Sofia Marino', 'individual', 100, 80), (12, 'Theo Brooks', 'individual', 100, 75),
  (13, 'Daniela Ruiz', 'individual', 100, 100), (14, 'Grace Kim', 'individual', 100, 100)
) as v (n, agent, basis, share, split)
join public.agents a on a.full_name = v.agent and a.workspace_id = '00000000-0000-4000-8000-000000000001';

-- Deal 5 was cleared before Maya's tier question came up; show it as it would be found.
update public.deals set status = 'open', waiting_on = 'finance' where id = '00000000-0000-4000-8000-00000000e005';

insert into public.deal_checklist (deal_id, workspace_id, label, done, done_at, position)
select d.id, d.workspace_id, c.label,
  d.status in ('closed', 'cleared', 'processed') or (c.pos < 3 and d.waiting_on <> 'agent'),
  case when d.status in ('closed', 'cleared', 'processed') or (c.pos < 3 and d.waiting_on <> 'agent') then now() - interval '1 day' end,
  c.pos
from public.deals d
cross join (values ('Notice of contract (NOC)', 1), ('Compliance documents', 2), ('Board package', 3), ('Signed lease or contract', 4)) as c (label, pos)
where d.workspace_id = '00000000-0000-4000-8000-000000000001';

insert into public.payments (id, workspace_id, method, amount, received_on, reference, explanation) values
  ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-000000000001', 'wire',  37050, current_date - 9, 'WIRE 20481', '18 Pine Ave ($22,800.00); Other ($14,250.00)'),
  ('00000000-0000-4000-8000-0000000000f2', '00000000-0000-4000-8000-000000000001', 'check', 19200, current_date - 5, 'CHK 1187', '77 Bay Rd ($19,200.00)'),
  ('00000000-0000-4000-8000-0000000000f3', '00000000-0000-4000-8000-000000000001', 'hyfin', 11400, current_date - 4, 'HYF 55102', '9 Hill Ct, #2 ($11,400.00)'),
  ('00000000-0000-4000-8000-0000000000f4', '00000000-0000-4000-8000-000000000001', 'wire',  48600, current_date - 2, 'WIRE 20533', '410 Mercer St, PH ($48,600.00)'),
  ('00000000-0000-4000-8000-0000000000f5', '00000000-0000-4000-8000-000000000001', 'check',  6900, current_date - 2, 'CHK 1203', '52 Kent Ave, #7C ($6,900.00)');
insert into public.payment_allocations (payment_id, deal_id, workspace_id, amount) values
  ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-00000000e002', '00000000-0000-4000-8000-000000000001', 22800),
  ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-00000000e001', '00000000-0000-4000-8000-000000000001', 14250),
  ('00000000-0000-4000-8000-0000000000f2', '00000000-0000-4000-8000-00000000e003', '00000000-0000-4000-8000-000000000001', 19200),
  ('00000000-0000-4000-8000-0000000000f3', '00000000-0000-4000-8000-00000000e004', '00000000-0000-4000-8000-000000000001', 11400),
  ('00000000-0000-4000-8000-0000000000f4', '00000000-0000-4000-8000-00000000e005', '00000000-0000-4000-8000-000000000001', 48600),
  ('00000000-0000-4000-8000-0000000000f5', '00000000-0000-4000-8000-00000000e006', '00000000-0000-4000-8000-000000000001', 6900);

-- ------------------------------------------------ second, smaller brokerage --
insert into public.agents (workspace_id, full_name, email, office, office_id, licence_masked, licence_status, w9_status, rider_status, onboarding_status, status, cohort, cohort_position, joined_on)
select '00000000-0000-4000-8000-000000000002', n.full_name,
  lower(replace(n.full_name, ' ', '.')) || '@agents.harbor-vine.test', 'Main office',
  '00000000-0000-4000-8000-0000000000b1', '20417 ••• ' || lpad((n.i * 113 % 1000)::text, 3, '0'),
  'verified', case when n.i > 4 then 'pending' else 'received' end, case when n.i > 4 then 'sent' else 'signed' end,
  case when n.i > 4 then 'in_progress' else 'ready' end, case when n.i > 4 then 'onboarding' else 'active' end,
  '2026-11', n.i, date '2026-11-05'
from unnest(array['Elise Marlow', 'Tobias Reyes', 'Wren Castillo', 'Hugo Bergstrom', 'Ada Lindqvist', 'Marlon Pryce']) with ordinality as n (full_name, i);
insert into public.riders (workspace_id, agent_id, version, split_pct, tiers, status, is_current, signed_name, signed_at, signed_consent)
select a.workspace_id, a.id, 1, 70, '[]', 'signed', true, a.full_name, now() - interval '5 days', true
from public.agents a where a.workspace_id = '00000000-0000-4000-8000-000000000002' and a.rider_status = 'signed';
insert into public.onboarding_batches (workspace_id, sent_at, sent_count, ready_count)
values ('00000000-0000-4000-8000-000000000002', now() - interval '6 days', 6, 4);

-- ------------------------------------------------------------------ people --
-- The first user ever created is Kinu staff.
insert into public.platform_admins (user_id)
select u.id from auth.users u order by u.created_at limit 1
on conflict do nothing;

-- Every existing user owns the main sample brokerage.
insert into public.workspace_members (workspace_id, user_id, role, email)
select '00000000-0000-4000-8000-000000000001', u.id, 'owner_admin', lower(u.email)
from auth.users u
on conflict (workspace_id, user_id) do update set role = 'owner_admin', status = 'active';

-- Start the sample audit trail clean, with a few readable entries.
delete from public.audit_log where workspace_id in ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002');
insert into public.audit_log (workspace_id, actor_label, action, entity, entity_id, summary, at)
select a.workspace_id, v.actor, v.action, 'agents', a.id::text, v.summary, now() - v.ago
from (values
  ('Jordan Ellis', 'Automatic', 'check', 'Payout checked against rider v2 · matched', interval '8 days'),
  ('Jordan Ellis', 'E-signature', 'sign', 'Individual rider v2 signed · certificate attached', interval '12 days'),
  ('Jordan Ellis', 'Automatic', 'verify', 'Licence matched to state record', interval '12 days 1 hour'),
  ('Jordan Ellis', 'Operations', 'team', 'Added to Team Ellis as lead', interval '12 days 2 hours'),
  ('Maya Chen', 'Automatic', 'tier', 'Crossed $40,000 GCI · tier move waiting for approval', interval '1 day'),
  ('Maya Chen', 'E-signature', 'sign', 'Individual rider v2 signed · certificate attached', interval '12 days'),
  ('Rosa Alvarez', 'Automatic', 'flag', 'Licence photo reads ••• 312, state record says ••• 321', interval '2 days')
) as v (agent, actor, action, summary, ago)
join public.agents a on a.full_name = v.agent and a.workspace_id = '00000000-0000-4000-8000-000000000001';

commit;

