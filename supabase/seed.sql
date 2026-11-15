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
