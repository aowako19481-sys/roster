-- A person chooses their own name the first time they sign in, so greetings
-- and lists show it instead of a name guessed from their email. Safe to run more than once.
create or replace function public.set_my_name(full_name text)
returns void language plpgsql security definer set search_path = '' as $$
declare n text := trim(regexp_replace(coalesce(full_name, ''), '\s+', ' ', 'g'));
begin
  if auth.uid() is null then raise exception 'Sign in first.' using errcode = '42501'; end if;
  if char_length(n) not between 2 and 120 then raise exception 'Enter your first and last name.'; end if;
  perform set_config('kinu.trusted', 'on', true);
  update public.workspace_members set display_name = n where user_id = auth.uid();
  perform set_config('kinu.trusted', 'off', true);
end;
$$;
revoke all on function public.set_my_name(text) from public, anon;
grant execute on function public.set_my_name(text) to authenticated;
