-- Deal checklist boxes that tick themselves, and each agent's earnings for a
-- year for the accountant. Safe to run more than once.

alter table public.checklist_items add column if not exists auto_tick text not null default 'none';
do $$ begin
  alter table public.checklist_items add constraint checklist_items_auto_tick_check check (auto_tick in ('none', 'payment', 'proof', 'receipt', 'cleared'));
exception when duplicate_object then null; end $$;

-- Ticks the boxes on one deal that the brokerage tied to this event. It never
-- unticks anything, and it never stops the action that caused it.
create or replace function private.auto_tick(deal uuid, event text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.deal_checklist c set done = true, done_at = now()
   where c.deal_id = deal and not c.done
     and exists (select 1 from public.checklist_items i
                  where i.workspace_id = c.workspace_id and lower(i.label) = lower(c.label) and i.auto_tick = event);
exception when others then
  null;   -- for example the deal is already frozen in a payroll: leave its checklist alone
end;
$$;

create or replace function private.tick_on_payment() returns trigger language plpgsql security definer set search_path = '' as $$
begin perform private.auto_tick(new.deal_id, 'payment'); return new; end; $$;
drop trigger if exists auto_tick on public.payment_allocations;
create trigger auto_tick after insert on public.payment_allocations for each row execute function private.tick_on_payment();

create or replace function private.tick_on_document() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.deal_id is not null and new.kind = 'payment_proof' then perform private.auto_tick(new.deal_id, 'proof'); end if;
  if new.deal_id is not null and new.kind = 'bank_receipt' then perform private.auto_tick(new.deal_id, 'receipt'); end if;
  return new;
end; $$;
drop trigger if exists auto_tick on public.documents;
create trigger auto_tick after insert on public.documents for each row execute function private.tick_on_document();

create or replace function private.tick_on_cleared() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'cleared' and old.status is distinct from new.status then perform private.auto_tick(new.id, 'cleared'); end if;
  return new;
end; $$;
drop trigger if exists auto_tick on public.deals;
create trigger auto_tick after update of status on public.deals for each row execute function private.tick_on_cleared();

-- What each agent was paid in one calendar year, from payrolls that were closed in it.
create or replace function public.year_earnings(ws uuid, yr integer)
returns table (agent_id uuid, full_name text, email text, office text, status text, w9_status text, deals_paid bigint, total_paid numeric)
language sql stable security definer set search_path = '' as $$
  select a.id, a.full_name, a.email, a.office, a.status, a.w9_status, count(distinct d.id), coalesce(sum(da.payout), 0)
    from public.agents a
    join public.deal_agents da on da.agent_id = a.id
    join public.deals d on d.id = da.deal_id and d.status = 'closed'
    join public.payrolls p on p.id = d.payroll_id and extract(year from p.pay_date) = yr
   where a.workspace_id = ws and yr between 2000 and 2100
     and private.has_cap(ws, 'reports.view') and (private.has_cap(ws, 'payouts.view') or private.has_cap(ws, 'statements.view'))
   group by a.id, a.full_name, a.email, a.office, a.status, a.w9_status
   order by a.full_name;
$$;
revoke all on function public.year_earnings(uuid, integer) from public, anon;
grant execute on function public.year_earnings(uuid, integer) to authenticated;
