-- Automation: each brokerage sets its own rules once, and Kinu then does the
-- repetitive steps by itself. Safe to run more than once.

create table if not exists public.automation (
  workspace_id          uuid primary key references public.workspaces (id) on delete cascade,
  default_tiers         jsonb not null default '[{"from":0,"to":20000,"pct":70},{"from":20000,"to":40000,"pct":80},{"from":40000,"to":null,"pct":85}]',
  send_pack_on_invite   boolean not null default true,    -- send the "new agent" documents when an agent is invited
  send_rider_on_invite  boolean not null default false,   -- send the first rider for signature when an agent is invited
  send_rider_on_tier    boolean not null default false,   -- after a tier move is approved, send the new rider for signature
  team_rider_mode       text not null default 'lead' check (team_rider_mode in ('lead', 'members')),
  updated_at            timestamptz not null default now()
);
alter table public.automation enable row level security;
alter table public.automation force row level security;
revoke all on table public.automation from anon, authenticated;
grant select on table public.automation to authenticated;
drop policy if exists "read" on public.automation;
create policy "read" on public.automation for select to authenticated using (private.has_cap(workspace_id, 'agents.view'));

-- The tiers a new agent starts on: the brokerage's own, or Kinu's starting set.
create or replace function private.default_tiers(ws uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce((select a.default_tiers from public.automation a where a.workspace_id = ws),
    '[{"from":0,"to":20000,"pct":70},{"from":20000,"to":40000,"pct":80},{"from":40000,"to":null,"pct":85}]'::jsonb);
$$;

create or replace function public.set_automation(ws uuid, tiers jsonb, pack_on_invite boolean, rider_on_invite boolean, rider_on_tier boolean, team_mode text)
returns void language plpgsql security definer set search_path = '' as $$
declare t jsonb; last_to numeric := 0; n integer := 0;
begin
  if not private.has_cap(ws, 'settings.manage') then raise exception 'You are not allowed to change these settings.' using errcode = '42501'; end if;
  if team_mode not in ('lead', 'members') then raise exception 'Choose who signs a team rider.'; end if;
  if jsonb_typeof(tiers) <> 'array' or jsonb_array_length(tiers) > 12 then raise exception 'Use up to 12 tiers.'; end if;
  for t in select * from jsonb_array_elements(tiers) loop
    n := n + 1;
    if (t->>'pct')::numeric < 0 or (t->>'pct')::numeric > 100 then raise exception 'Each tier needs a split from 0 to 100.'; end if;
    if (t->>'from')::numeric <> last_to then raise exception 'Each tier must start where the one before it ends.'; end if;
    if t->>'to' is null then
      if n <> jsonb_array_length(tiers) then raise exception 'Only the last tier can be open-ended.'; end if;
    else
      if (t->>'to')::numeric <= (t->>'from')::numeric then raise exception 'Each tier must end above where it starts.'; end if;
      last_to := (t->>'to')::numeric;
    end if;
  end loop;
  insert into public.automation (workspace_id, default_tiers, send_pack_on_invite, send_rider_on_invite, send_rider_on_tier, team_rider_mode)
  values (ws, tiers, pack_on_invite, rider_on_invite, rider_on_tier, team_mode)
  on conflict (workspace_id) do update set default_tiers = excluded.default_tiers, send_pack_on_invite = excluded.send_pack_on_invite,
    send_rider_on_invite = excluded.send_rider_on_invite, send_rider_on_tier = excluded.send_rider_on_tier,
    team_rider_mode = excluded.team_rider_mode, updated_at = now();
end;
$$;

-- Document packs: a document can go out by itself when an agent is invited, or when one leaves.
alter table public.sign_templates add column if not exists pack text not null default 'none';
alter table public.sign_templates add column if not exists default_signers jsonb not null default '[]';
do $$ begin
  alter table public.sign_templates add constraint sign_templates_pack_check check (pack in ('none', 'invite', 'exit'));
exception when duplicate_object then null; end $$;

-- `people` lists who signs each role after the first (the first is always the agent): [{name, email}, ...]
create or replace function public.set_template_pack(ws uuid, template uuid, new_pack text, people jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare t record;
begin
  if not private.can_send_documents(ws) then raise exception 'You are not allowed to change documents to sign.' using errcode = '42501'; end if;
  if new_pack not in ('none', 'invite', 'exit') then raise exception 'Unknown choice.'; end if;
  select * into t from public.sign_templates where id = template and workspace_id = ws and active;
  if not found then raise exception 'That document could not be found.'; end if;
  if jsonb_typeof(people) <> 'array' then raise exception 'The signers could not be read.'; end if;
  if new_pack <> 'none' then
    if jsonb_array_length(people) <> jsonb_array_length(t.roles) - 1 then raise exception 'Say who signs each of the other roles, so this can be sent without anyone having to choose.'; end if;
    if exists (select 1 from jsonb_array_elements(people) p where char_length(coalesce(p->>'name', '')) not between 2 and 160 or coalesce(p->>'email', '') !~ '^[^\s@]+@[^\s@]+\.[^\s@]{2,}$') then
      raise exception 'Each of the other signers needs a name and an email address.';
    end if;
  end if;
  update public.sign_templates set pack = new_pack, default_signers = people, updated_at = now() where id = template;
end;
$$;

-- A rider that a tier approval has already made current can still be sent to
-- the agent to sign as their record. Pay does not wait for it and its status
-- does not change: the approval is what made it current.
create or replace function public.open_sign_request(ws uuid, rider uuid, agent uuid, name text, email text, envelope text, mode text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare r record; made uuid;
begin
  if not private.has_cap(ws, 'riders.manage') then raise exception 'You are not allowed to send riders for signature.' using errcode = '42501'; end if;
  select * into r from public.riders where id = rider and workspace_id = ws and (status in ('draft', 'sent') or (status = 'signed' and is_current));
  if not found then raise exception 'That rider is not waiting for a signature.'; end if;
  if not exists (select 1 from public.agents a where a.id = agent and a.workspace_id = ws) then raise exception 'That agent could not be found.'; end if;
  if r.agent_id is not null and r.agent_id <> agent then raise exception 'That rider belongs to a different agent.'; end if;
  if r.team_id is not null and not exists (
       select 1 from public.teams t where t.id = r.team_id and t.lead_agent_id = agent
       union all select 1 from public.team_members m where m.team_id = r.team_id and m.agent_id = agent) then
    raise exception 'That agent is not on this team.';
  end if;
  if exists (select 1 from public.sign_requests s where s.rider_id = rider and s.agent_id = agent and s.status in ('sent', 'opened')) then
    raise exception 'This rider is already out for signature with that person.';
  end if;
  insert into public.sign_requests (workspace_id, rider_id, agent_id, signer_name, signer_email, envelope_id, created_by)
  values (ws, rider, agent, left(trim(name), 160), left(lower(trim(email)), 254), left(envelope, 120), auth.uid())
  returning id into made;
  perform set_config('kinu.trusted', 'on', true);
  update public.riders set status = case when r.status = 'signed' then r.status else 'sent' end, sign_mode = case when r.team_id is not null and mode in ('lead', 'members') then mode else sign_mode end where id = rider;
  perform set_config('kinu.trusted', 'off', true);
  return made;
end;
$$;

-- Inviting an agent now starts them on the brokerage's own tiers.
CREATE OR REPLACE FUNCTION public.invite_agent(ws uuid, agent_name text, agent_email text, agent_office uuid, split numeric, token_hash text, agent_phone text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare out_id uuid; office_name text; clean_email text := lower(trim(agent_email));
begin
  if not private.has_cap(ws, 'agents.invite') then raise exception 'You are not allowed to invite agents.' using errcode = '42501'; end if;
  if char_length(trim(coalesce(agent_name, ''))) < 2 then raise exception 'Each agent needs a name.'; end if;
  if clean_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]{2,}$' then raise exception 'The email for % does not look right.', trim(agent_name); end if;
  if split is null or split < 0 or split > 100 then raise exception 'The split for % must be between 0 and 100.', trim(agent_name); end if;
  if token_hash !~ '^[0-9a-f]{64}$' then raise exception 'bad token'; end if;
  if exists (select 1 from public.agents a where a.workspace_id = ws and lower(a.email) = clean_email) then
    raise exception '% is already on file.', clean_email; end if;
  select o.name into office_name from public.offices o where o.id = agent_office and o.workspace_id = ws;
  if office_name is null then raise exception 'Choose an office for %.', trim(agent_name); end if;

  perform set_config('kinu.trusted', 'on', true);
  insert into public.agents (workspace_id, full_name, email, phone, office, office_id, cohort, status, licence_status,
                             w9_status, rider_status, onboarding_status, invite_token_hash, invite_expires_at, invite_sent_at, joined_on)
  values (ws, trim(agent_name), clean_email, nullif(trim(coalesce(agent_phone, '')), ''), office_name, agent_office,
          to_char(now(), 'YYYY-MM'), 'invited', 'not_uploaded', 'pending', 'sent', 'in_progress',
          token_hash, now() + interval '14 days', now(), current_date)
  returning id into out_id;
  perform set_config('kinu.trusted', 'off', true);

  perform private.make_rider(ws, out_id, null, split,
    private.default_tiers(ws), 'sent', null);
  perform private.note_invite(ws);
  return out_id;
end;
$function$;

do $$
declare f text;
begin
  foreach f in array array['public.set_automation(uuid, jsonb, boolean, boolean, boolean, text)', 'public.set_template_pack(uuid, uuid, text, jsonb)'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
