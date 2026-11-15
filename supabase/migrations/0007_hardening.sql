-- Kinu: fixes found while building and testing the pages.
-- Safe to run more than once.

-- 1. Payout recalculation is bookkeeping, not a human change: keep it out of
--    the audit log so real changes are easy to read.
create or replace function private.audit_row()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  old_j jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  new_j jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
  row_j jsonb := coalesce(new_j, old_j);
  changed jsonb;
begin
  if current_setting('kinu.recalc', true) = 'on' then return coalesce(new, old); end if;

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
    coalesce(row_j ->> 'id', row_j ->> 'user_id', row_j ->> 'agent_id'),
    case tg_op when 'UPDATE' then changed
               when 'INSERT' then new_j - 'invite_token_hash'
               else old_j - 'invite_token_hash' end
  );
  return coalesce(new, old);
end;
$$;

-- 2. The checklist of a deal that is already in a payroll is frozen, like its
--    lines and fees.
drop trigger if exists guard_child on public.deal_checklist;
create trigger guard_child before insert or update or delete on public.deal_checklist
  for each row execute function private.guard_deal_child();

-- 3. Cutoff only takes deals that belong to this payroll: cleared, and
--    deposited on or before the pay date. Later deals wait for their own.
create or replace function public.run_cutoff(ws uuid, payroll uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare p record; taken integer; held integer;
begin
  if not private.has_cap(ws, 'payroll.manage') then raise exception 'not allowed' using errcode = '42501'; end if;
  select * into p from public.payrolls where id = payroll and workspace_id = ws for update;
  if not found or p.status <> 'open' then raise exception 'This payroll is not open.'; end if;
  if exists (select 1 from public.payrolls o where o.workspace_id = ws and o.status = 'open' and o.pay_date < p.pay_date) then
    raise exception 'An earlier payroll is still open. Run its cutoff first.';
  end if;
  perform set_config('kinu.payroll', 'on', true);
  update public.deals set status = 'processed', payroll_id = payroll, updated_at = now()
   where workspace_id = ws and status = 'cleared' and (deposit_date is null or deposit_date <= p.pay_date);
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

-- 4. Each deal sees its own address and amount first on a split payment.
alter table public.payment_allocations add column if not exists explanation text;

create or replace function public.record_payment(
  ws uuid, pay_method text, pay_amount numeric, pay_date date, pay_reference text, allocations jsonb, proof text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare out_id uuid; total numeric; a jsonb; line text := '';
begin
  if not private.has_cap(ws, 'payments.manage') then raise exception 'not allowed' using errcode = '42501'; end if;
  if jsonb_typeof(allocations) <> 'array' or jsonb_array_length(allocations) = 0 then raise exception 'Choose at least one deal.'; end if;
  select sum((x ->> 'amount')::numeric) into total from jsonb_array_elements(allocations) x;
  if total <> pay_amount then raise exception 'The parts add up to % but the payment is %.', total, pay_amount; end if;
  if proof is not null and proof not like ws::text || '/payments/%' then raise exception 'That proof does not belong to this brokerage.'; end if;

  insert into public.payments (workspace_id, method, amount, received_on, reference, proof_path, created_by)
  values (ws, pay_method, pay_amount, pay_date, nullif(trim(pay_reference), ''), proof, (select auth.uid()))
  returning id into out_id;

  for a in select * from jsonb_array_elements(allocations) loop
    insert into public.payment_allocations (payment_id, deal_id, workspace_id, amount)
    values (out_id, (a ->> 'deal_id')::uuid, ws, (a ->> 'amount')::numeric);
  end loop;

  -- For each deal: its own address and amount, then "Other ($...)" for each other part.
  update public.payment_allocations mine
     set explanation = d.address || ' ($' || to_char(mine.amount, 'FM999,999,990.00') || ')' ||
         coalesce((select string_agg('; Other ($' || to_char(o.amount, 'FM999,999,990.00') || ')', '' order by o.amount desc)
                     from public.payment_allocations o where o.payment_id = out_id and o.id <> mine.id), '')
    from public.deals d
   where mine.payment_id = out_id and d.id = mine.deal_id;

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

-- 5. Teams: enforce the brokerage's "teams per agent" limit in the database,
--    and keep the team label shown beside an agent's name in step.
create or replace function private.guard_team_member()
returns trigger language plpgsql security definer set search_path = '' as $$
declare allowed integer; have integer;
begin
  select w.max_teams_per_agent into allowed from public.workspaces w where w.id = new.workspace_id;
  select count(*) into have from public.team_members tm where tm.agent_id = new.agent_id and tm.team_id <> new.team_id;
  if have >= coalesce(allowed, 1) then
    raise exception 'This agent is already on % team(s), the most this brokerage allows.', have;
  end if;
  return new;
end;
$$;
drop trigger if exists guard on public.team_members;
create trigger guard before insert on public.team_members
  for each row execute function private.guard_team_member();

create or replace function private.sync_team_label()
returns trigger language plpgsql security definer set search_path = '' as $$
declare who uuid := coalesce(new.agent_id, old.agent_id); label text;
begin
  select t.name || case when t.lead_agent_id = who then ' · lead' else '' end into label
    from public.team_members tm join public.teams t on t.id = tm.team_id
   where tm.agent_id = who order by t.created_at limit 1;
  perform set_config('kinu.trusted', 'on', true);
  update public.agents set team_label = label where id = who;
  perform set_config('kinu.trusted', 'off', true);
  return null;
end;
$$;
drop trigger if exists sync_label on public.team_members;
create trigger sync_label after insert or update or delete on public.team_members
  for each row execute function private.sync_team_label();

-- 6. A rider can only be drafted for an agent or team of this brokerage.
create or replace function public.draft_rider(ws uuid, agent uuid, team uuid, pct numeric, rider_tiers jsonb default '[]')
returns uuid language plpgsql security definer set search_path = '' as $$
begin
  if not private.has_cap(ws, 'riders.manage') then raise exception 'not allowed' using errcode = '42501'; end if;
  if (agent is null) = (team is null) then raise exception 'Choose an agent or a team.'; end if;
  if agent is not null and not exists (select 1 from public.agents a where a.id = agent and a.workspace_id = ws) then
    raise exception 'No such agent.'; end if;
  if team is not null and not exists (select 1 from public.teams t where t.id = team and t.workspace_id = ws) then
    raise exception 'No such team.'; end if;
  if pct is null or pct < 0 or pct > 100 then raise exception 'The split must be between 0 and 100.'; end if;
  update public.riders set status = 'void'
   where status in ('draft', 'sent') and workspace_id = ws
     and ((agent is not null and agent_id = agent) or (team is not null and team_id = team));
  if agent is not null then
    perform set_config('kinu.trusted', 'on', true);
    update public.agents set rider_status = 'sent' where id = agent and workspace_id = ws and rider_status <> 'signed';
    perform set_config('kinu.trusted', 'off', true);
  end if;
  return private.make_rider(ws, agent, team, pct, rider_tiers, 'sent', null);
end;
$$;
revoke all on function public.draft_rider(uuid, uuid, uuid, numeric, jsonb) from public, anon;
grant execute on function public.draft_rider(uuid, uuid, uuid, numeric, jsonb) to authenticated;

-- 7. Say what a tier approval actually does: it takes effect when approved.
update public.riders set signature_note = 'Tier approved by the brokerage · takes effect from the next deal'
 where signature_note = 'Tier approval. Drafted for e-signature.';

-- 8. Staff who manage files may remove a stored file from their own
--    brokerage's folder (for example after a failed save).
drop policy if exists "kinu staff remove documents" on storage.objects;
create policy "kinu staff remove documents" on storage.objects
  for delete to authenticated
  using (bucket_id = 'documents' and (
    private.has_cap(private.path_workspace(name), 'files.manage')
    or private.has_cap(private.path_workspace(name), 'payments.manage')));

-- Finance staff who record payments need to open the proofs they stored.
drop policy if exists "kinu members read documents" on storage.objects;
create policy "kinu members read documents" on storage.objects
  for select to authenticated
  using (bucket_id = 'documents' and (
    private.has_cap(private.path_workspace(name), 'files.view')
    or (name like '%/payments/%' and private.has_cap(private.path_workspace(name), 'deals.view'))));

-- 9. Changing one plan piece must never wipe the others.
create or replace function public.platform_update_workspace(
  ws uuid, ws_name text default null, ws_ops boolean default null, ws_finance boolean default null,
  ws_addons text[] default null, ws_status text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare cur record;
begin
  if not private.is_platform_admin() then raise exception 'Kinu staff only' using errcode = '42501'; end if;
  if ws_status is not null and ws_status not in ('active','paused','closed') then raise exception 'unknown status'; end if;
  select * into cur from public.workspaces where id = ws;
  if not found then raise exception 'No such brokerage.'; end if;
  if not coalesce(ws_ops, cur.has_ops) and not coalesce(ws_finance, cur.has_finance) then
    raise exception 'A brokerage cannot have both Ops and Finance locked. Pause it instead.';
  end if;
  update public.workspaces set
    name = coalesce(nullif(trim(ws_name), ''), name),
    has_ops = coalesce(ws_ops, has_ops),
    has_finance = coalesce(ws_finance, has_finance),
    addons = case when ws_addons is null then addons
                  else array(select a from unnest(ws_addons) a where a in ('retention','finance_shield','compliance')) end,
    status = coalesce(ws_status, status)
  where id = ws;
end;
$$;

-- 10. Settings: an empty reply alias clears it.
create or replace function public.update_settings(
  ws uuid, ws_timezone text default null, ws_weekdays integer[] default null, ws_cutoff time default null,
  ws_close time default null, ws_alias text default null, ws_max_teams integer default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not private.has_cap(ws, 'settings.manage') then raise exception 'not allowed' using errcode = '42501'; end if;
  if ws_weekdays is not null and (cardinality(ws_weekdays) = 0 or exists (select 1 from unnest(ws_weekdays) d where d not between 1 and 7)) then
    raise exception 'Pick at least one payroll day.'; end if;
  if ws_max_teams is not null and ws_max_teams not between 1 and 10 then raise exception 'Teams per agent must be between 1 and 10.'; end if;
  update public.workspaces set
    timezone = coalesce(nullif(trim(ws_timezone), ''), timezone),
    payroll_weekdays = coalesce(ws_weekdays, payroll_weekdays),
    cutoff_time = coalesce(ws_cutoff, cutoff_time),
    close_time = coalesce(ws_close, close_time),
    reply_alias = case when ws_alias is null then reply_alias else nullif(lower(trim(ws_alias)), '') end,
    max_teams_per_agent = coalesce(ws_max_teams, max_teams_per_agent)
  where id = ws;
end;
$$;

-- 11. An office or custom role given to a member must belong to the same brokerage.
create or replace function private.guard_member()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.office_id is not null and not exists (select 1 from public.offices o where o.id = new.office_id and o.workspace_id = new.workspace_id) then
    raise exception 'That office belongs to a different brokerage.' using errcode = '42501';
  end if;
  if new.custom_role_id is not null and not exists (select 1 from public.custom_roles r where r.id = new.custom_role_id and r.workspace_id = new.workspace_id) then
    raise exception 'That role belongs to a different brokerage.' using errcode = '42501';
  end if;
  return new;
end;
$$;
drop trigger if exists guard on public.workspace_members;
create trigger guard before insert or update on public.workspace_members
  for each row execute function private.guard_member();

create or replace function private.guard_invite()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.office_id is not null and not exists (select 1 from public.offices o where o.id = new.office_id and o.workspace_id = new.workspace_id) then
    raise exception 'That office belongs to a different brokerage.' using errcode = '42501';
  end if;
  return new;
end;
$$;
drop trigger if exists guard on public.member_invites;
create trigger guard before insert or update on public.member_invites
  for each row execute function private.guard_invite();

drop trigger if exists same_ws on public.custom_roles;
create trigger same_ws before insert or update on public.custom_roles
  for each row execute function private.same_workspace('office_id', 'offices');

-- 12. Owner powers belong to people whose role really is Owner. Someone who
--     has been given a custom role acts under that role only.
create or replace function private.has_cap(ws uuid, cap text)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare
  m record;
  product text := private.cap_product(cap);
  caps text[];
  is_owner boolean;
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

  is_owner := m.role = 'owner_admin' and m.custom_role_id is null;
  if cap = 'override' then return is_owner or m.can_override; end if;
  if cap = 'payroll.release' then return is_owner or m.can_release_payroll; end if;

  if m.custom_role_id is not null then
    select r.caps into caps from public.custom_roles r where r.id = m.custom_role_id;
  else
    caps := private.role_caps(m.role);
  end if;
  return cap = any (coalesce(caps, array[]::text[]));
end;
$$;

create or replace function public.grant_power(ws uuid, member uuid, power text, granted boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not (private.is_platform_admin() or exists (
        select 1 from public.workspace_members m
         where m.workspace_id = ws and m.user_id = (select auth.uid()) and m.role = 'owner_admin'
           and m.custom_role_id is null and m.status = 'active')) then
    raise exception 'Only the owner can grant this.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.workspace_members m where m.workspace_id = ws and m.user_id = member and m.status = 'active') then
    raise exception 'That person is not an active member of this brokerage.';
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

-- Assigning a custom role takes a person's big powers away, like a role change.
create or replace function private.drop_powers_on_custom_role()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.custom_role_id is distinct from old.custom_role_id then
    new.can_override := false; new.can_release_payroll := false;
  end if;
  return new;
end;
$$;
drop trigger if exists drop_powers on public.workspace_members;
create trigger drop_powers before update on public.workspace_members
  for each row execute function private.drop_powers_on_custom_role();

-- 13. The role reference is available to any member of the brokerage.
create or replace function public.role_preview(ws uuid, role text)
returns text[] language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(c), array[]::text[])
    from unnest(private.role_caps(role)) c, public.workspaces w
   where w.id = ws
     and (private.is_platform_admin() or private.is_workspace_member(ws))
     and (private.cap_product(c) = 'any'
          or (private.cap_product(c) = 'finance' and w.has_finance)
          or (private.cap_product(c) = 'ops' and w.has_ops));
$$;
