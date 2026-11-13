-- Run once in the Supabase SQL editor. Only the public browser key belongs in config.js.
begin;

create table public.brightwork_workspaces (
  user_id uuid primary key references auth.users(id) on delete cascade,
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  revision bigint not null default 1 check (revision > 0),
  updated_at timestamptz not null default now()
);

alter table public.brightwork_workspaces enable row level security;
revoke all on public.brightwork_workspaces from anon, authenticated;
grant select, insert, update on public.brightwork_workspaces to authenticated;

create policy "Read own workspace" on public.brightwork_workspaces
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Create own workspace" on public.brightwork_workspaces
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Update own workspace" on public.brightwork_workspaces
  for update to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- An atomic compare-and-save prevents a stale device from overwriting newer work.
-- The owner comes from the authenticated session, never from a client parameter.
create function public.save_brightwork_workspace(new_payload jsonb, expected_revision bigint)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  owner_id uuid := auth.uid();
  workspace public.brightwork_workspaces%rowtype;
begin
  if owner_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if expected_revision is null or expected_revision < 0 then raise exception 'Invalid revision'; end if;
  if jsonb_typeof(new_payload) is distinct from 'object'
     or (new_payload->>'version') is distinct from '3'
     or jsonb_typeof(new_payload->'tasks') is distinct from 'array'
     or jsonb_typeof(new_payload->'stats') is distinct from 'object'
     or jsonb_typeof(new_payload->'preferences') is distinct from 'object'
     or octet_length(new_payload::text) > 5242880 then
    raise exception 'Invalid workspace data';
  end if;
  if expected_revision = 0 then
    insert into public.brightwork_workspaces(user_id, payload)
      values (owner_id, new_payload) on conflict (user_id) do nothing returning * into workspace;
    if found then return jsonb_build_object('conflict', false, 'revision', workspace.revision, 'payload', workspace.payload); end if;
  else
    update public.brightwork_workspaces set payload = new_payload, revision = revision + 1, updated_at = now()
      where user_id = owner_id and revision = expected_revision returning * into workspace;
    if found then return jsonb_build_object('conflict', false, 'revision', workspace.revision, 'payload', workspace.payload); end if;
  end if;
  select * into workspace from public.brightwork_workspaces where user_id = owner_id;
  return jsonb_build_object('conflict', true, 'revision', coalesce(workspace.revision, 0), 'payload', workspace.payload);
end;
$$;

revoke all on function public.save_brightwork_workspace(jsonb, bigint) from public, anon;
grant execute on function public.save_brightwork_workspace(jsonb, bigint) to authenticated;
commit;
