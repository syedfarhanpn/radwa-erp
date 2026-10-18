-- ============================================================================
--  Radwa Gulf and Co — HR Manager role and account
--
--  Run this whole file in the Supabase SQL Editor (Dashboard → SQL Editor →
--  New query → paste → Run). Safe to run as many times as you like.
--
--  It ends with a verification table. Every row must read OK.
--
--  WHAT IT DOES
--    1. Widens the profiles.role constraint to admit 'HR'.
--    2. Creates the HR Manager's account: nadia / radwa2026.
--    3. Repairs that account the way 0003 repairs the others — empty strings
--       in GoTrue's bookkeeping columns and an auth.identities row — so it can
--       actually sign in.
--
--  Step 3 is done here rather than relying on 0003 having redefined
--  seed_demo_account, because this file has no way to know which version of
--  that function is installed. Repeating the repair costs nothing and removes
--  the guess.
--
--  THE EMPLOYEE RECORDS THEMSELVES ARE NOT A TABLE HERE.
--  The whole workflow database — enquiries, bid packages and now employees —
--  lives in workspace_state.data as one JSON document (see 0002). The HR
--  module therefore needs no schema change beyond this role, and its records
--  sync across devices through the same path as everything else.
-- ============================================================================

-- ------------------------------------------- 1. widen the role constraint --

alter table public.profiles
  drop constraint if exists profiles_role_check;

alter table public.profiles
  add constraint profiles_role_check check (
    role in (
      'CRM_MANAGER',
      'MD',
      'ESTIMATOR',
      'MCP',
      'SURVEYOR',
      'DEPARTMENT_REVIEWER',
      'HR'
    )
  );

-- ------------------------------------------------- 2. create the account --

do $hr$
begin
  perform public.seed_demo_account(
    'nadia',
    'Nadia Rahman',
    'usr_hr_nadia',
    'HR',
    'radwa2026'
  );
end
$hr$;

-- --------------------------------------- 3. make sure it can actually sign in

-- Empty strings, never NULL: GoTrue reads these into non-nullable Go strings
-- and an unreadable row breaks sign-in for the whole project.
do $$
declare
  v_column text;
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
    end if;
  end loop;
end;
$$;

-- A password sign-in resolves the user through their 'email' identity. The
-- column shape differs between Supabase versions, so both are handled.
do $$
declare
  v_created int;
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'auth' and table_name = 'identities' and column_name = 'provider_id'
  ) then
    insert into auth.identities (
      id, user_id, identity_data, provider, provider_id,
      last_sign_in_at, created_at, updated_at
    )
    select
      gen_random_uuid(), u.id,
      jsonb_build_object('sub', u.id::text, 'email', u.email,
                         'email_verified', true, 'phone_verified', false),
      'email', u.id::text, now(), now(), now()
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
      jsonb_build_object('sub', u.id::text, 'email', u.email,
                         'email_verified', true, 'phone_verified', false),
      'email', now(), now(), now()
    from auth.users u
    where not exists (
      select 1 from auth.identities i where i.user_id = u.id and i.provider = 'email'
    );
  end if;

  get diagnostics v_created = row_count;
  raise notice 'identities created: %', v_created;
end;
$$;

-- Confirm the address, or the account exists but cannot sign in.
update auth.users
set email_confirmed_at = coalesce(email_confirmed_at, now())
where email = 'nadia@radwa.example';

-- ------------------------------------------------------- 4. verify, report

select
  check_name,
  detail,
  case when passed then 'OK' else 'FAILED' end as result
from (
  select 1 as ord,
         'HR role accepted' as check_name,
         coalesce(string_agg(username, ', '), 'none') as detail,
         count(*) = 1 as passed
  from public.profiles where role = 'HR'

  union all
  select 2,
         'nadia has an auth account',
         coalesce(max(email), 'MISSING'),
         count(*) = 1
  from auth.users where email = 'nadia@radwa.example'

  union all
  select 3,
         'nadia has an email identity',
         count(*)::text || ' identity row(s)',
         count(*) >= 1
  from auth.identities i
  join auth.users u on u.id = i.user_id
  where u.email = 'nadia@radwa.example' and i.provider = 'email'

  union all
  select 4,
         'nadia is confirmed',
         case when bool_and(email_confirmed_at is not null) then 'confirmed' else 'NOT confirmed' end,
         bool_and(email_confirmed_at is not null)
  from auth.users where email = 'nadia@radwa.example'

  union all
  select 5,
         'nadia maps to the right person',
         coalesce(max(directory_user_id), 'MISSING'),
         max(directory_user_id) = 'usr_hr_nadia'
  from public.profiles where username = 'nadia'

  union all
  select 6,
         'all accounts present',
         count(*)::text || ' profiles',
         count(*) = 19
  from public.profiles
) checks
order by ord;
