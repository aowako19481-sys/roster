-- Kinu: messages from the public website's "Get started" form.
-- Safe to run more than once.
--
-- Nobody outside can read or write this table. The website's server hands a
-- message to submit_lead(), which checks it and limits how many can arrive.
-- Only Kinu staff can read the inbox.

create table if not exists public.leads (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  name        text not null check (char_length(name) between 2 and 120),
  company     text not null check (char_length(company) between 2 and 160),
  email       text not null check (char_length(email) between 5 and 254),
  agents      text not null default '',
  plan        text not null default '',
  message     text not null default '' check (char_length(message) <= 2000),
  sender_key  text not null,                    -- a one-way fingerprint of the sender's address, for limits only
  handled_at  timestamptz,
  handled_by  text
);
create index if not exists leads_recent_idx on public.leads (created_at desc);
create index if not exists leads_sender_idx on public.leads (sender_key, created_at);

alter table public.leads enable row level security;
alter table public.leads force row level security;
revoke all on table public.leads from anon, authenticated;
grant select on table public.leads to authenticated;
drop policy if exists "staff read" on public.leads;
create policy "staff read" on public.leads for select to authenticated using (private.is_platform_admin());

create or replace function public.submit_lead(
  lead_name text, lead_company text, lead_email text, lead_agents text, lead_plan text, lead_message text, sender text)
returns text language plpgsql security definer set search_path = '' as $$
declare clean_email text := lower(trim(coalesce(lead_email, '')));
begin
  if char_length(trim(coalesce(lead_name, ''))) < 2 then return 'name'; end if;
  if char_length(trim(coalesce(lead_company, ''))) < 2 then return 'company'; end if;
  if clean_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or char_length(clean_email) > 254 then return 'email'; end if;
  if coalesce(sender, '') = '' then return 'busy'; end if;
  -- Limits: a handful per sender per hour, and a ceiling for the whole site per day.
  if (select count(*) from public.leads l where l.sender_key = sender and l.created_at > now() - interval '1 hour') >= 3 then return 'busy'; end if;
  if (select count(*) from public.leads l where l.created_at > now() - interval '1 day') >= 300 then return 'busy'; end if;
  insert into public.leads (name, company, email, agents, plan, message, sender_key)
  values (left(trim(lead_name), 120), left(trim(lead_company), 160), clean_email, left(coalesce(lead_agents, ''), 40),
          left(coalesce(lead_plan, ''), 200), left(coalesce(lead_message, ''), 2000), left(sender, 64));
  return 'ok';
end;
$$;

-- Staff: mark a message as dealt with, or put it back.
create or replace function public.handle_lead(lead uuid, is_handled boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_platform_admin() then raise exception 'not allowed' using errcode = '42501'; end if;
  update public.leads set handled_at = case when is_handled then now() end,
         handled_by = case when is_handled then private.actor_label() end where id = lead;
end;
$$;

do $$
begin
  execute 'revoke all on function public.submit_lead(text, text, text, text, text, text, text) from public, anon, authenticated';
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.submit_lead(text, text, text, text, text, text, text) to service_role';
  end if;
  execute 'revoke all on function public.handle_lead(uuid, boolean) from public, anon';
  execute 'grant execute on function public.handle_lead(uuid, boolean) to authenticated';
end $$;
