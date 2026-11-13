-- Run after 202611130001_workspaces.sql, including on an existing project.
begin;

create function public.save_brightwork_workspace(new_payload jsonb, expected_revision bigint, expected_user_id uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  owner_id uuid := auth.uid();
  workspace public.brightwork_workspaces%rowtype;
begin
  -- Ownership still comes from auth.uid(). The expected ID only rejects a save
  -- whose browser session switched accounts while the request was in flight.
  if owner_id is null or expected_user_id is distinct from owner_id then
    raise exception 'Account changed; sign in again before saving' using errcode = '42501';
  end if;
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

revoke all on function public.save_brightwork_workspace(jsonb, bigint, uuid) from public, anon;
grant execute on function public.save_brightwork_workspace(jsonb, bigint, uuid) to authenticated;
drop function public.save_brightwork_workspace(jsonb, bigint);
commit;
