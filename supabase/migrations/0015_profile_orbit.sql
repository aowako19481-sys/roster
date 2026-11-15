-- Kinu: each brokerage's contact details and logo for its ID card, and the
-- grouped view behind the founder console's orbit.
-- Safe to run more than once.

alter table public.workspaces add column if not exists contact_name  text not null default '' check (char_length(contact_name) <= 120);
alter table public.workspaces add column if not exists contact_email text not null default '' check (char_length(contact_email) <= 254);
alter table public.workspaces add column if not exists contact_phone text not null default '' check (char_length(contact_phone) <= 40);
alter table public.workspaces add column if not exists address       text not null default '' check (char_length(address) <= 240);
alter table public.workspaces add column if not exists website       text not null default '' check (char_length(website) <= 200);
alter table public.workspaces add column if not exists logo_path     text;

-- Kinu staff: the details shown on a brokerage's ID card.
create or replace function public.platform_set_profile(
  ws uuid, new_contact text, new_email text, new_phone text, new_address text, new_website text, new_logo text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_platform_admin() then raise exception 'not allowed' using errcode = '42501'; end if;
  if new_logo is not null and new_logo not like ws::text || '/%' then raise exception 'That file is filed under a different brokerage.'; end if;
  update public.workspaces set
    contact_name = left(trim(coalesce(new_contact, '')), 120), contact_email = left(lower(trim(coalesce(new_email, ''))), 254),
    contact_phone = left(trim(coalesce(new_phone, '')), 40), address = left(trim(coalesce(new_address, '')), 240),
    website = left(trim(coalesce(new_website, '')), 200), logo_path = coalesce(new_logo, logo_path)
  where id = ws;
  if not found then raise exception 'That brokerage could not be found.'; end if;
end;
$$;
revoke all on function public.platform_set_profile(uuid, text, text, text, text, text, text) from public, anon;
grant execute on function public.platform_set_profile(uuid, text, text, text, text, text, text) to authenticated;

-- The founder console's orbit: a handful of brokerages under each heading
-- that matters today. Names and account numbers only.
create or replace function public.platform_orbit()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare this_month date := date_trunc('month', now())::date; result jsonb;
begin
  if not private.is_platform_admin() then raise exception 'not allowed' using errcode = '42501'; end if;
  with tagged as (
    select w.id, w.name, w.account_no, w.status, w.created_at,
           (select count(*) from public.agents a where a.workspace_id = w.id and a.status <> 'exited') as agents,
           exists (select 1 from public.billing_months b where b.workspace_id = w.id and b.proof_path is null and b.paid_on is null) as awaiting,
           (select max(c.ends_on) from public.contracts c where c.workspace_id = w.id) as ends_on
      from public.workspaces w
  ), groups as (
    select 1 as pos, 'awaiting' as key, 'Awaiting payment' as label, t.id, t.name, t.account_no, t.agents, row_number() over (order by t.name) as rn, count(*) over () as n from tagged t where t.awaiting and t.status = 'active'
    union all
    select 2, 'ending', 'Contract ending soon', t.id, t.name, t.account_no, t.agents, row_number() over (order by t.ends_on), count(*) over () from tagged t where t.status = 'active' and t.ends_on is not null and t.ends_on <= (now() + interval '60 days')::date
    union all
    select 3, 'new', 'New this month', t.id, t.name, t.account_no, t.agents, row_number() over (order by t.created_at desc), count(*) over () from tagged t where date_trunc('month', t.created_at)::date = this_month
    union all
    select 4, 'largest', 'Largest rosters', t.id, t.name, t.account_no, t.agents, row_number() over (order by t.agents desc, t.name), count(*) over () from tagged t where t.status = 'active'
    union all
    select 5, 'paused', 'Paused', t.id, t.name, t.account_no, t.agents, row_number() over (order by t.name), count(*) over () from tagged t where t.status = 'paused'
  )
  select coalesce(jsonb_agg(g order by (g->>'pos')::int), '[]'::jsonb) into result from (
    select jsonb_build_object('pos', pos, 'key', key, 'label', label, 'count', max(n),
             'items', jsonb_agg(jsonb_build_object('id', id, 'name', name, 'account_no', account_no, 'agents', agents) order by rn)) as g
      from groups where rn <= 12 group by pos, key, label) q;
  return result;
end;
$$;
revoke all on function public.platform_orbit() from public, anon;
grant execute on function public.platform_orbit() to authenticated;
