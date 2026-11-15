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
