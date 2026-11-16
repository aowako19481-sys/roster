-- Licence checks, the same way in every state: Kinu shows the record and its
-- own consistency checks; a person at the brokerage confirms or flags, and the
-- result carries who checked it, when, and against what. Safe to run more than once.

alter table public.agents add column if not exists licence_checked_at timestamptz;
alter table public.agents add column if not exists licence_checked_by text;
alter table public.agents add column if not exists licence_source text;

-- The official look-up page for each state this brokerage works in. The
-- brokerage enters it once; staff then reach the state record in one click.
create table if not exists public.licence_lookups (
  workspace_id  uuid not null references public.workspaces (id) on delete cascade,
  state         text not null check (state ~ '^[A-Z]{2}$'),
  url           text not null,
  updated_at    timestamptz not null default now(),
  primary key (workspace_id, state)
);
alter table public.licence_lookups drop constraint if exists licence_lookups_url_check;
alter table public.licence_lookups add constraint licence_lookups_url_check check (url ~ '^https://\S+$' and char_length(url) between 12 and 400);
alter table public.licence_lookups enable row level security;
alter table public.licence_lookups force row level security;
revoke all on table public.licence_lookups from anon, authenticated;
grant select on table public.licence_lookups to authenticated;
drop policy if exists "read" on public.licence_lookups;
create policy "read" on public.licence_lookups for select to authenticated using (private.has_cap(workspace_id, 'agents.view'));

create or replace function public.set_licence_lookup(ws uuid, lookup_state text, lookup_url text)
returns void language plpgsql security definer set search_path = '' as $$
declare st text := upper(trim(coalesce(lookup_state, ''))); link text := trim(coalesce(lookup_url, ''));
begin
  if not private.has_cap(ws, 'settings.manage') then raise exception 'You are not allowed to change these settings.' using errcode = '42501'; end if;
  if st !~ '^[A-Z]{2}$' then raise exception 'Use the two-letter state code, like NY.'; end if;
  if link = '' then delete from public.licence_lookups where workspace_id = ws and state = st; return; end if;
  if link !~ '^https://\S+$' or char_length(link) not between 12 and 400 then raise exception 'Paste the full address of the state’s look-up page, starting with https://'; end if;
  insert into public.licence_lookups (workspace_id, state, url) values (ws, st, link)
  on conflict (workspace_id, state) do update set url = excluded.url, updated_at = now();
end;
$$;

-- Confirming or flagging a licence now records who, when and against what.
create or replace function public.review_licence(ws uuid, agent uuid, verdict text, note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare who text;
begin
  if not private.has_cap(ws, 'riders.manage') then raise exception 'You are not allowed to verify documents.' using errcode = '42501'; end if;
  if verdict not in ('verified', 'mismatch') then raise exception 'unknown verdict'; end if;
  select coalesce(nullif(trim(m.display_name), ''), m.email) into who from public.workspace_members m where m.workspace_id = ws and m.user_id = auth.uid() limit 1;
  perform set_config('kinu.trusted', 'on', true);
  update public.agents set licence_status = verdict,
         licence_note = case when verdict = 'verified' then null else coalesce(nullif(trim(note), ''), 'number mismatch') end,
         licence_checked_at = now(), licence_checked_by = left(coalesce(who, 'Brokerage staff'), 160),
         licence_source = 'Checked by a person at the brokerage against the state''s public record'
   where id = agent and workspace_id = ws;
  perform private.refresh_onboarding(agent);
  perform set_config('kinu.trusted', 'off', true);
  perform private.log(ws, verdict, 'licence', agent::text,
    case when verdict = 'verified' then 'Licence confirmed against the state record' else 'Licence flagged: ' || coalesce(note, 'mismatch') end);
end;
$$;

revoke all on function public.set_licence_lookup(uuid, text, text) from public, anon;
grant execute on function public.set_licence_lookup(uuid, text, text) to authenticated;
