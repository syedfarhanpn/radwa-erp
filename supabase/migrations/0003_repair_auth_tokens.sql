-- ============================================================================
--  Radwa Gulf and Co — repair manually-seeded auth users
--
--  Run this whole file in the Supabase SQL Editor (Dashboard → SQL Editor →
--  New query → paste → Run). Safe to run as many times as you like.
--
--  It prints what it found and what it changed. The last statement returns a
--  verification table — if every row says OK, sign-in works.
--
--  ------------------------------------------------------------------------
--  THE BUG IT FIXES
--
--  Migration 0001 created the eighteen accounts by inserting straight into
--  auth.users. That is the only way to seed accounts from SQL, but it skips
--  two things Supabase's auth service (GoTrue) depends on:
--
--  1. BOOKKEEPING COLUMNS LEFT NULL
--     confirmation_token, recovery_token, the email_change pair, the
--     phone_change pair and reauthentication_token are read into plain Go
--     strings, which cannot hold NULL. The row becomes unreadable.
--
--  2. NO auth.identities ROW
--     A password sign-in resolves the user through their 'email' identity.
--     A user with no identity row cannot sign in even when the password is
--     correct.
--
--  Either one surfaces on EVERY sign-in — not just the seeded accounts — as:
--
--      500  {"error_code":"unexpected_failure",
--            "msg":"Database error querying schema"}
--
--  which is why the app fell back to its built-in accounts and reported
--  "This device only".
-- ============================================================================

-- ------------------------------------------------- 1. before: what is wrong

do $$
declare
  v_users      int;
  v_null_cols  int := 0;
  v_identities int;
  v_column     text;
  v_count      int;
  v_columns text[] := array[
    'confirmation_token', 'recovery_token',
    'email_change', 'email_change_token_new', 'email_change_token_current',
    'phone_change', 'phone_change_token', 'reauthentication_token'
  ];
begin
  select count(*) into v_users from auth.users;

  foreach v_column in array v_columns loop
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'auth' and table_name = 'users' and column_name = v_column
    ) then
      execute format('select count(*) from auth.users where %I is null', v_column) into v_count;
      v_null_cols := v_null_cols + v_count;
    end if;
  end loop;

  select count(*) into v_identities
  from auth.users u
  where not exists (
    select 1 from auth.identities i where i.user_id = u.id and i.provider = 'email'
  );

  raise notice '--- BEFORE ---';
  raise notice 'auth users                     : %', v_users;
  raise notice 'NULL bookkeeping values        : %  (must be 0)', v_null_cols;
  raise notice 'users with no email identity   : %  (must be 0)', v_identities;
end;
$$;

-- ----------------------------------------- 2. repair the NULL text columns --

-- Column names differ between Supabase versions, so each is checked before it
-- is touched. A column this version does not have is skipped, not an error.
do $$
declare
  v_column text;
  v_fixed  int;
  v_total  int := 0;
  v_columns text[] := array[
    'confirmation_token', 'recovery_token',
    'email_change', 'email_change_token_new', 'email_change_token_current',
    'phone_change', 'phone_change_token', 'reauthentication_token'
  ];
begin
  foreach v_column in array v_columns loop
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'auth' and table_name = 'users' and column_name = v_column
    ) then
      execute format('update auth.users set %I = '''' where %I is null', v_column, v_column);
      get diagnostics v_fixed = row_count;
      if v_fixed > 0 then
        raise notice 'repaired auth.users.% — % row(s)', v_column, v_fixed;
      end if;
      v_total := v_total + v_fixed;
    end if;
  end loop;
  raise notice 'NULL repair: % value(s) set to empty string.', v_total;
end;
$$;

-- ------------------------------------------ 3. create the missing identities

-- auth.identities changed shape across versions: newer ones have a uuid `id`
-- plus a separate `provider_id`, older ones use the provider's id as the
-- primary key. Both are handled rather than assumed.
do $$
declare
  v_has_provider_id boolean;
  v_created int;
begin
  select exists (
    select 1 from information_schema.columns
    where table_schema = 'auth' and table_name = 'identities' and column_name = 'provider_id'
  ) into v_has_provider_id;

  if v_has_provider_id then
    insert into auth.identities (
      id, user_id, identity_data, provider, provider_id,
      last_sign_in_at, created_at, updated_at
    )
    select
      gen_random_uuid(), u.id,
      jsonb_build_object(
        'sub', u.id::text,
        'email', u.email,
        'email_verified', true,
        'phone_verified', false
      ),
      'email', u.id::text,
      now(), now(), now()
    from auth.users u
    where not exists (
      select 1 from auth.identities i where i.user_id = u.id and i.provider = 'email'
    );
  else
    insert into auth.identities (
      id, user_id, identity_data, provider,
      last_sign_in_at, created_at, updated_at
    )
    select
      u.id::text, u.id,
      jsonb_build_object(
        'sub', u.id::text,
        'email', u.email,
        'email_verified', true,
        'phone_verified', false
      ),
      'email',
      now(), now(), now()
    from auth.users u
    where not exists (
      select 1 from auth.identities i where i.user_id = u.id and i.provider = 'email'
    );
  end if;

  get diagnostics v_created = row_count;
  raise notice 'identities created: %', v_created;
end;
$$;

-- --------------------------------------------- 4. stop creating broken rows

-- Same function as in 0001, now writing the bookkeeping columns explicitly and
-- creating the identity row. 0001 has been corrected to match; this
-- redefinition means you do not have to re-run it.
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
  v_has_provider_id boolean;
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
      '', '', '', '', '', '', ''
    );
  else
    update auth.users
       set encrypted_password     = extensions.crypt(p_password, extensions.gen_salt('bf')),
           email_confirmed_at     = coalesce(email_confirmed_at, now()),
           confirmation_token     = coalesce(confirmation_token, ''),
           recovery_token         = coalesce(recovery_token, ''),
           email_change           = coalesce(email_change, ''),
           email_change_token_new = coalesce(email_change_token_new, ''),
           phone_change           = coalesce(phone_change, ''),
           phone_change_token     = coalesce(phone_change_token, ''),
           reauthentication_token = coalesce(reauthentication_token, ''),
           updated_at             = now()
     where id = v_id;
  end if;

  -- A password sign-in resolves the user through this row. Without it the
  -- account exists but cannot authenticate.
  select exists (
    select 1 from information_schema.columns
    where table_schema = 'auth' and table_name = 'identities' and column_name = 'provider_id'
  ) into v_has_provider_id;

  if not exists (select 1 from auth.identities i where i.user_id = v_id and i.provider = 'email') then
    if v_has_provider_id then
      insert into auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
      values (
        extensions.gen_random_uuid(), v_id,
        jsonb_build_object('sub', v_id::text, 'email', v_email, 'email_verified', true, 'phone_verified', false),
        'email', v_id::text, now(), now(), now()
      );
    else
      insert into auth.identities (id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
      values (
        v_id::text, v_id,
        jsonb_build_object('sub', v_id::text, 'email', v_email, 'email_verified', true, 'phone_verified', false),
        'email', now(), now(), now()
      );
    end if;
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

-- ----------------------------------------------------- 5. verify, and report

-- Every row must read OK. Anything else is the thing still to fix.
select
  check_name,
  detail,
  case when passed then 'OK' else 'FAILED' end as result
from (
  select 1 as ord,
         'accounts exist' as check_name,
         count(*)::text || ' auth users' as detail,
         count(*) = 18 as passed
  from auth.users

  union all
  select 2,
         'profiles exist',
         count(*)::text || ' profiles',
         count(*) = 18
  from public.profiles

  union all
  select 3,
         'no NULL bookkeeping values',
         count(*)::text || ' unreadable user row(s)',
         count(*) = 0
  from auth.users
  where confirmation_token is null
     or recovery_token is null
     or email_change is null
     or email_change_token_new is null
     or phone_change is null
     or phone_change_token is null
     or reauthentication_token is null

  union all
  select 4,
         'every user has an email identity',
         count(*)::text || ' user(s) without one',
         count(*) = 0
  from auth.users u
  where not exists (
    select 1 from auth.identities i where i.user_id = u.id and i.provider = 'email'
  )

  union all
  select 5,
         'every user is confirmed',
         count(*)::text || ' unconfirmed',
         count(*) = 0
  from auth.users
  where email_confirmed_at is null

  union all
  select 6,
         'workspace row ready',
         'revision ' || coalesce(max(revision)::text, 'missing'),
         count(*) = 1
  from public.workspace_state
) checks
order by ord;
