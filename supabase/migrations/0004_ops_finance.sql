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
                                    'Tier approved by the brokerage · takes effect from the next deal');
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
