-- Kinu: editing a deal's details after it has been created.
-- Safe to run more than once.
--
-- Address, GCI, type, deposit date and PP number can be changed while a deal
-- is open, held or cleared. Deals already in a payroll stay frozen. Payouts
-- and the rider check are worked out again by the database on every change.

create or replace function private.guard_deal()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if current_setting('kinu.payroll', true) = 'on' or current_setting('kinu.recalc', true) = 'on' then return new; end if;
  if tg_op = 'INSERT' then
    if new.status not in ('open', 'held') then new.status := 'open'; end if;
    new.payroll_id := null;
    -- Worked out by the database from GCI, fees and splits; never taken from the caller.
    new.net := 0; new.company_dollar := 0;
    return new;
  end if;
  -- The calculated figures and the brokerage a deal belongs to cannot be set by hand.
  new.net := old.net;
  new.company_dollar := old.company_dollar;
  new.workspace_id := old.workspace_id;
  new.created_by := old.created_by;
  new.created_at := old.created_at;
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
  -- Changing the money or the type of a deal that was already cleared sends
  -- it back to open, so a person looks at it again before it enters a payroll.
  if old.status = 'cleared' and new.status = 'cleared'
     and (new.gci is distinct from old.gci or new.deal_type is distinct from old.deal_type) then
    new.status := 'open';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

-- Payments are recorded only through record_payment, which checks that the
-- parts add up and writes each deal's explanation line. They cannot be
-- inserted, altered or removed by hand through the API.
revoke insert, update, delete on table public.payments, public.payment_allocations from authenticated;
drop policy if exists "write" on public.payments;
drop policy if exists "write" on public.payment_allocations;

-- A payout line's calculated fields cannot be set by hand either: the check
-- trigger already rewrites the rider check, and this pins the payout until
-- the database recalculates it.
create or replace function private.guard_line_money()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if current_setting('kinu.recalc', true) = 'on' then return new; end if;
  if tg_op = 'UPDATE' then
    new.payout := old.payout;
    new.workspace_id := old.workspace_id;
    new.deal_id := old.deal_id;
  else
    new.payout := 0;
  end if;
  return new;
end;
$$;
drop trigger if exists guard_money on public.deal_agents;
create trigger guard_money before insert or update on public.deal_agents
  for each row execute function private.guard_line_money();
