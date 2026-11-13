-- Run in the SQL editor after applying the migration. No rows survive rollback.
begin;

do $$
declare
  account_a uuid := gen_random_uuid();
  account_b uuid := gen_random_uuid();
  document jsonb := '{"version":3,"tasks":[],"stats":{},"preferences":{}}'::jsonb;
  saved jsonb;
  visible_rows integer;
  affected_rows integer;
  denied boolean;
begin
  insert into auth.users(id, aud, role, email) values
    (account_a, 'authenticated', 'authenticated', account_a::text || '@brightwork-test.invalid'),
    (account_b, 'authenticated', 'authenticated', account_b::text || '@brightwork-test.invalid');

  perform set_config('request.jwt.claims', jsonb_build_object('sub', account_a, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', account_a::text, true);
  execute 'set local role authenticated';
  saved := public.save_brightwork_workspace(document, 0, account_a);
  if (saved->>'conflict')::boolean or (saved->>'revision')::integer <> 1 then raise exception 'First save failed'; end if;
  saved := public.save_brightwork_workspace(document, 0, account_a);
  if not (saved->>'conflict')::boolean then raise exception 'Stale save was accepted'; end if;
  saved := public.save_brightwork_workspace(document, 1, account_a);
  if (saved->>'conflict')::boolean or (saved->>'revision')::integer <> 2 then raise exception 'Revision update failed'; end if;

  perform set_config('request.jwt.claims', jsonb_build_object('sub', account_b, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', account_b::text, true);
  denied := false;
  begin
    perform public.save_brightwork_workspace(document, 0, account_a);
  exception when insufficient_privilege then denied := true;
  end;
  if not denied then raise exception 'A delayed save used a different account session'; end if;
  select count(*) into visible_rows from public.brightwork_workspaces where user_id = account_a;
  if visible_rows <> 0 then raise exception 'Another user can read the workspace'; end if;
  update public.brightwork_workspaces set payload = document where user_id = account_a;
  get diagnostics affected_rows = row_count;
  if affected_rows <> 0 then raise exception 'Another user can update the workspace'; end if;
  denied := false;
  begin
    insert into public.brightwork_workspaces(user_id, payload) values (account_a, document);
  exception when insufficient_privilege then denied := true;
  end;
  if not denied then raise exception 'Another user can create a workspace for someone else'; end if;
  saved := public.save_brightwork_workspace(document, 0, account_b);
  if (saved->>'conflict')::boolean then raise exception 'Second user cannot create their own workspace'; end if;

  execute 'set local role anon';
  perform set_config('request.jwt.claims', '{}', true);
  perform set_config('request.jwt.claim.sub', '', true);
  denied := false;
  begin
    perform payload from public.brightwork_workspaces;
  exception when insufficient_privilege then denied := true;
  end;
  if not denied then raise exception 'Anonymous users can read workspaces'; end if;
  denied := false;
  begin
    perform public.save_brightwork_workspace(document, 0, account_b);
  exception when insufficient_privilege then denied := true;
  end;
  if not denied then raise exception 'Anonymous users can execute the save function'; end if;
  execute 'reset role';
  raise notice 'Workspace isolation and revision checks passed. Rolling back test data.';
end;
$$;

rollback;
