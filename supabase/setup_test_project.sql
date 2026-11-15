-- Kinu: one-paste setup for the Supabase TEST project.
-- This file is the three files below joined together, in order. Safe to run more than once.
--   supabase/migrations/0001_step1_dashboard.sql
--   supabase/migrations/0002_first_run_tour.sql
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

-- Roster, build step 1: FAKE sample data for the TEST project.
-- Every person, licence fragment and dollar figure below is invented.
-- Safe to run more than once: it rebuilds the sample workspace each time.
--
-- Run this AFTER adding your own user (Authentication -> Users), because the
-- last statement makes every existing user of this TEST project a member of
-- the sample workspace. If you add a user later, just run this file again.

begin;

delete from public.workspaces where id = '00000000-0000-4000-8000-000000000001';

insert into public.workspaces (id, name, timezone)
values ('00000000-0000-4000-8000-000000000001', 'Sample Brokerage (fake data)', 'America/New_York');

-- Established agents (joined before this cohort): they fill out the top ten.
insert into public.agents
  (workspace_id, full_name, office, team_label, licence_masked, licence_status,
   w9_status, rider_status, onboarding_status, gci_ytd, gci_change_pct)
values
  ('00000000-0000-4000-8000-000000000001', 'Daniela Ruiz',   'Manhattan · UES',         null,             '10401 ••• 441', 'verified', 'received', 'signed', 'ready', 361500, 9),
  ('00000000-0000-4000-8000-000000000001', 'Marcus Hale',    'Westchester · Rye',       'Hale Group · lead', '10401 ••• 615', 'verified', 'received', 'signed', 'ready', 344900, 21),
  ('00000000-0000-4000-8000-000000000001', 'Aisha Bello',    'Brooklyn · Williamsburg', null,             '10401 ••• 129', 'verified', 'received', 'signed', 'ready', 327300, 6),
  ('00000000-0000-4000-8000-000000000001', 'Kenji Nakamura', 'Queens · LIC',            'Team Nakamura · lead', '10401 ••• 870', 'verified', 'received', 'signed', 'ready', 301750, -3),
  ('00000000-0000-4000-8000-000000000001', 'Sofia Marino',   'Manhattan · Tribeca',     null,             '10401 ••• 233', 'verified', 'received', 'signed', 'ready', 288400, 4),
  ('00000000-0000-4000-8000-000000000001', 'Grace Kim',      'Manhattan · SoHo',        null,             '10401 ••• 506', 'verified', 'received', 'signed', 'ready', 244100, -2),
  ('00000000-0000-4000-8000-000000000001', 'Owen Price',     'Westchester · Scarsdale', null,             '10401 ••• 784', 'verified', 'received', 'signed', 'ready', 229600, 7);

-- November cohort: the eight agents shown first on the dashboard.
insert into public.agents
  (workspace_id, full_name, office, team_label, cohort, cohort_position, licence_masked,
   licence_status, licence_note, w9_status, rider_status, onboarding_status, gci_ytd, gci_change_pct)
values
  ('00000000-0000-4000-8000-000000000001', 'Maya Chen',    'Manhattan · SoHo',        null,                '2026-11', 1, '10401 ••• 338', 'verified',     null,                 'received',      'signed',   'ready',       412800, 18),
  ('00000000-0000-4000-8000-000000000001', 'Jordan Ellis', 'Brooklyn · Park Slope',   'Team Ellis · lead', '2026-11', 2, '10401 ••• 058', 'verified',     null,                 'received',      'signed',   'ready',       398200, 12),
  ('00000000-0000-4000-8000-000000000001', 'Rosa Alvarez', 'Manhattan · UES',         null,                '2026-11', 3, '10401 ••• 312', 'mismatch',     'number mismatch',    'received',      'sent',     'flagged',     0, null),
  ('00000000-0000-4000-8000-000000000001', 'Theo Brooks',  'Queens · Astoria',        'Team Ellis',        '2026-11', 4, '10401 ••• 914', 'verified',     null,                 'name_mismatch', 'signed',   'flagged',     261900, 11),
  ('00000000-0000-4000-8000-000000000001', 'Priya Nair',   'Manhattan · SoHo',        null,                '2026-11', 5, '10401 ••• 772', 'verified',     null,                 'pending',       'not_sent', 'in_progress', 0, null),
  ('00000000-0000-4000-8000-000000000001', 'Kwame Osei',   'Brooklyn · Williamsburg', null,                '2026-11', 6, '10401 ••• 660', 'expiring',     'expires in 21 days', 'received',      'signed',   'flagged',     0, null),
  ('00000000-0000-4000-8000-000000000001', 'Lena Park',    'Westchester · Rye',       null,                '2026-11', 7, null,            'not_uploaded', 'not uploaded',       'pending',       'not_sent', 'in_progress', 0, null),
  ('00000000-0000-4000-8000-000000000001', 'Sam Okafor',   'Manhattan · SoHo',        'Team Ellis',        '2026-11', 8, '10401 ••• 207', 'verified',     null,                 'received',      'signed',   'ready',       0, null);

-- The other 42 invented agents of the cohort:
-- 35 ready, 4 in progress with a verified licence, 3 in progress with none yet.
insert into public.agents
  (workspace_id, full_name, office, cohort, cohort_position, licence_masked,
   licence_status, licence_note, w9_status, rider_status, onboarding_status)
select
  '00000000-0000-4000-8000-000000000001',
  n.full_name,
  (array['Manhattan · SoHo', 'Brooklyn · Park Slope', 'Manhattan · UES', 'Queens · Astoria',
         'Brooklyn · Williamsburg', 'Westchester · Rye', 'Manhattan · Tribeca', 'Queens · LIC'])[1 + (n.i % 8)],
  '2026-11',
  8 + n.i,
  case when n.i > 39 then null else '10401 ••• ' || lpad(((n.i * 37 + 101) % 1000)::text, 3, '0') end,
  case when n.i > 39 then 'not_uploaded' else 'verified' end,
  case when n.i > 39 then 'not uploaded' else null end,
  case when n.i > 35 then 'pending' else 'received' end,
  case when n.i > 35 then 'not_sent' else 'signed' end,
  case when n.i > 35 then 'in_progress' else 'ready' end
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
  ('Kwame Osei',   'Expiring', 'Licence expires 5 Dec · renewal reminder sent', 3)
) as v (full_name, tag, detail, position)
join public.agents a
  on a.full_name = v.full_name
 and a.workspace_id = '00000000-0000-4000-8000-000000000001';

insert into public.tier_approvals
  (workspace_id, subject_kind, subject_name, reason, from_pct, to_pct, status, position)
values
  ('00000000-0000-4000-8000-000000000001', 'agent', 'Maya Chen',   'crossed $40,000 GCI',       80, 85, 'waiting',  1),
  ('00000000-0000-4000-8000-000000000001', 'team',  'Team Ellis',  'crossed $250,000 team GCI', 75, 78, 'waiting',  2),
  ('00000000-0000-4000-8000-000000000001', 'agent', 'Marcus Hale', 'crossed $80,000 GCI',       85, 90, 'waiting',  3),
  ('00000000-0000-4000-8000-000000000001', 'agent', 'Aisha Bello', 'crossed $20,000 GCI',       70, 80, 'approved', 4);

-- Make every existing user of this TEST project a member of the sample workspace.
insert into public.workspace_members (workspace_id, user_id, role)
select '00000000-0000-4000-8000-000000000001', u.id, 'owner_admin'
from auth.users u
on conflict do nothing;

commit;
