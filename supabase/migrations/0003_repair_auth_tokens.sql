-- ============================================================================
--  Radwa Gulf and Co — repair manually-seeded auth users
--
--  Run this in the Supabase SQL Editor after 0001 and 0002. Safe to re-run.
--
--  THE BUG IT FIXES
--    Migration 0001 created the eighteen accounts by inserting straight into
--    auth.users. That is the only way to seed accounts from SQL, but it leaves
--    a set of bookkeeping columns — confirmation_token, recovery_token, the
--    email_change pair, the phone_change pair, reauthentication_token — as
--    NULL.
--
--    Supabase's auth service (GoTrue) reads those columns into plain Go
--    strings, which cannot hold NULL. The scan fails, and the failure surfaces
--    on every sign-in attempt as:
--
--        500  {"error_code":"unexpected_failure",
--              "msg":"Database error querying schema"}
--
--    It is not limited to the seeded accounts. Once one unreadable row exists,
--    authentication is broken for the whole project, which is why the app fell
--    back to its built-in accounts and reported "This device only".
--
--    The fix is to write empty strings where the NULLs are, and to stop
--    creating new ones.
-- ============================================================================

-- ------------------------------------------------- repair existing rows ----

-- Column names differ a little between Supabase versions, so each one is
-- checked before it is touched rather than assumed. A missing column is
-- skipped instead of aborting the migration.
do $$
declare
  v_column text;
  v_fixed  int;
  v_total  int := 0;
  v_columns text[] := array[
    'confirmation_token',
    'recovery_token',
    'email_change',
    'email_change_token_new',
    'email_change_token_current',
    'phone_change',
    'phone_change_token',
    'reauthentication_token'
  ];
begin
  foreach v_column in array v_columns loop
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'auth'
        and table_name   = 'users'
        and column_name  = v_column
    ) then
      execute format(
        'update auth.users set %I = '''' where %I is null',
        v_column, v_column
      );
      get diagnostics v_fixed = row_count;
      v_total := v_total + v_fixed;
      if v_fixed > 0 then
        raise notice 'auth.users.% — repaired % row(s)', v_column, v_fixed;
      end if;
    end if;
  end loop;

  raise notice 'Repair complete: % column value(s) changed from NULL to empty string.', v_total;
end;
$$;

-- --------------------------------------------- stop creating new ones ------

-- Same function as in 0001, with the bookkeeping columns written explicitly so
-- a fresh run — or adding a nineteenth account later — cannot reintroduce the
-- fault. 0001 has been corrected to match; this redefinition is here so you do
-- not have to re-run it.
create or replace function public.seed_demo_account(
  p_username          text,
  p_full_name         text,
  p_directory_user_id text,
  p_role              text,
  p_password          text,
  p_department        text default null,
  p_is_management     boolean default false,
  p_is_md             boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := p_username || '@radwa.example';
  v_id    uuid;
begin
  select id into v_id from auth.users where email = v_email;

  if v_id is null then
    v_id := gen_random_uuid();
    insert into auth.users (
      id, instance_id, aud, role, email,
      encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at,
      -- GoTrue scans these into non-nullable strings. Empty, never NULL.
      confirmation_token, recovery_token,
      email_change, email_change_token_new,
      phone_change, phone_change_token,
      reauthentication_token
    ) values (
      v_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', v_email,
      extensions.crypt(p_password, extensions.gen_salt('bf')), now(),
      jsonb_build_object('provider', 'email', 'providers', array['email']),
      jsonb_build_object('full_name', p_full_name),
      now(), now(),
      '', '',
      '', '',
      '', '',
      ''
    );
  else
    update auth.users
       set encrypted_password = extensions.crypt(p_password, extensions.gen_salt('bf')),
           email_confirmed_at = coalesce(email_confirmed_at, now()),
           confirmation_token = coalesce(confirmation_token, ''),
           recovery_token     = coalesce(recovery_token, ''),
           email_change       = coalesce(email_change, ''),
           email_change_token_new = coalesce(email_change_token_new, ''),
           phone_change       = coalesce(phone_change, ''),
           phone_change_token = coalesce(phone_change_token, ''),
           reauthentication_token = coalesce(reauthentication_token, ''),
           updated_at         = now()
     where id = v_id;
  end if;

  insert into public.profiles (
    id, username, full_name, directory_user_id, role, department, is_management_team, is_md
  ) values (
    v_id, p_username, p_full_name, p_directory_user_id, p_role, p_department, p_is_management, p_is_md
  )
  on conflict (id) do update
    set username           = excluded.username,
        full_name          = excluded.full_name,
        directory_user_id  = excluded.directory_user_id,
        role               = excluded.role,
        department         = excluded.department,
        is_management_team = excluded.is_management_team,
        is_md              = excluded.is_md;

  return v_id;
end;
$$;

-- ----------------------------------------------------------------- checks --
--  Should return 0:
--    select count(*) from auth.users
--    where confirmation_token is null or recovery_token is null
--       or email_change is null or email_change_token_new is null
--       or phone_change is null or phone_change_token is null
--       or reauthentication_token is null;
--
--  Should return 18:
--    select count(*) from public.profiles;
