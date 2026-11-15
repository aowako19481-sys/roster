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
