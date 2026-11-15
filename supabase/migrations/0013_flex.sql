-- Kinu: each brokerage's own deal checklist, and the name of the transaction
-- system it uses (Dotloop, SkySlope, a shared drive, or none).
-- Safe to run more than once.

alter table public.workspaces add column if not exists deal_system text not null default ''
  check (char_length(deal_system) <= 40);

-- The boxes every new deal starts with. A manager sets these once.
create table if not exists public.checklist_items (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces (id) on delete cascade,
  label         text not null check (char_length(label) between 1 and 120),
  position      integer not null default 0,
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  unique (workspace_id, label)
);
create index if not exists checklist_items_ws_idx on public.checklist_items (workspace_id, position);

alter table public.checklist_items enable row level security;
alter table public.checklist_items force row level security;
revoke all on table public.checklist_items from anon, authenticated;
grant select, insert, update, delete on table public.checklist_items to authenticated;
drop policy if exists "read" on public.checklist_items;
create policy "read" on public.checklist_items for select to authenticated using (private.has_cap(workspace_id, 'deals.view'));
drop policy if exists "write" on public.checklist_items;
create policy "write" on public.checklist_items for all to authenticated
  using (private.has_cap(workspace_id, 'payroll.manage')) with check (private.has_cap(workspace_id, 'payroll.manage'));
drop trigger if exists audit_checklist_items on public.checklist_items;
create trigger audit_checklist_items after insert or update or delete on public.checklist_items
  for each row execute function private.audit_row();

-- Managers: name the system the brokerage keeps its deal files in.
create or replace function public.set_deal_system(ws uuid, system_name text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not private.has_cap(ws, 'payroll.manage') then raise exception 'not allowed' using errcode = '42501'; end if;
  update public.workspaces set deal_system = left(trim(coalesce(system_name, '')), 40) where id = ws;
end;
$$;
revoke all on function public.set_deal_system(uuid, text) from public, anon;
grant execute on function public.set_deal_system(uuid, text) to authenticated;
