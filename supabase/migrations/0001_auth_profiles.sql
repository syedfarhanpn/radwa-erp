-- ============================================================================
--  Radwa Gulf and Co — sign-in accounts
--
--  Run this once in the Supabase SQL Editor (Dashboard → SQL Editor → New
--  query → paste → Run). It is safe to re-run: every statement is idempotent.
--
--  What it creates
--    • public.profiles — the application identity for each auth user: which
--      person in the directory they are, and the role they sign in as.
--    • Row-level security so a signed-in user can read the directory but can
--      only ever change their own row, and nobody can change a role from the
--      client.
--    • The eighteen demo accounts, with a shared password.
--
--  Before running, in Dashboard → Authentication → Providers → Email:
--    turn OFF "Confirm email", otherwise these seeded accounts cannot sign in.
-- ============================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- profiles --

create table if not exists public.profiles (
  id                uuid primary key references auth.users (id) on delete cascade,
  username          text not null unique,
  full_name         text not null,
  -- Matches User.id in src/data/people.ts, so the app can resolve the signed-in
  -- user to the person who owns assignments, approvals and activity records.
  directory_user_id text not null unique,
  role              text not null check (
                      role in ('CRM_MANAGER','MD','ESTIMATOR','MCP','SURVEYOR','DEPARTMENT_REVIEWER')
                    ),
  department        text,
  is_management_team boolean not null default false,
  is_md             boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

comment on table public.profiles is
  'Application identity for each auth user. The role is held here, not in token claims, so it cannot be edited by the client.';

alter table public.profiles enable row level security;

-- Any signed-in user may read the directory — the app needs names and roles to
-- show assignments and approvers. Nobody may read it anonymously.
drop policy if exists "profiles readable by authenticated users" on public.profiles;
create policy "profiles readable by authenticated users"
  on public.profiles for select
  to authenticated
  using (true);

-- A user may update only their own row. Role and identity columns are frozen:
-- changing them is an administrative action, not a client one.
drop policy if exists "users update own profile" on public.profiles;
create policy "users update own profile"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id)
  with check (
    auth.uid() = id
    and role = (select p.role from public.profiles p where p.id = auth.uid())
    and directory_user_id = (select p.directory_user_id from public.profiles p where p.id = auth.uid())
  );

-- No insert or delete policy: profiles are created by the seeding below or by
-- an administrator using the service role, never from the browser.

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function public.touch_updated_at();

-- ------------------------------------------------------------ demo accounts --

-- Creates (or updates) one auth user plus its profile.
-- SECURITY: this seeds *demonstration* accounts with a shared, well-known
-- password. Delete this function and change every password before this project
-- holds anything real.
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
      -- These must be empty strings, never NULL. Supabase's auth service reads
      -- them into non-nullable Go strings; a NULL makes the row unreadable and
      -- breaks sign-in for the ENTIRE project with
      -- "Database error querying schema". See 0003_repair_auth_tokens.sql.
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

  -- A password sign-in resolves the user through their 'email' identity row.
  -- Without it the account exists but cannot authenticate, and the auth
  -- service reports "Database error querying schema". The column shape differs
  -- between Supabase versions, so both are handled.
  if not exists (select 1 from auth.identities i where i.user_id = v_id and i.provider = 'email') then
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'auth' and table_name = 'identities' and column_name = 'provider_id'
    ) then
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

-- The shared demo password. Change it here and re-run to rotate every account.
do $seed$
declare
  pw text := 'radwa2026';
begin
  -- Management Team ---------------------------------------------------------
  perform public.seed_demo_account('babukuttan', 'Babukuttan', 'usr_md_babukuttan', 'MD',          pw, null, true, true);
  perform public.seed_demo_account('md1',        'MD1',        'usr_md_1',          'MD',          pw, null, true, false);
  perform public.seed_demo_account('md2',        'MD2',        'usr_md_2',          'MD',          pw, null, true, false);

  -- CRM ---------------------------------------------------------------------
  perform public.seed_demo_account('layla',      'Layla Haddad', 'usr_crm_layla',   'CRM_MANAGER', pw);

  -- Estimators --------------------------------------------------------------
  perform public.seed_demo_account('estimator1', 'Estimator 1', 'usr_est_1',        'ESTIMATOR',   pw);
  perform public.seed_demo_account('estimator2', 'Estimator 2', 'usr_est_2',        'ESTIMATOR',   pw);

  -- MCP / Project Managers --------------------------------------------------
  perform public.seed_demo_account('akshai',     'Akshai',      'usr_mcp_akshai',   'MCP',         pw);
  perform public.seed_demo_account('sandeep',    'Sandeep',     'usr_mcp_sandeep',  'MCP',         pw);
  perform public.seed_demo_account('pk',         'PK',          'usr_mcp_pk',       'MCP',         pw);

  -- Surveyors ---------------------------------------------------------------
  perform public.seed_demo_account('majid',      'Majid Al Balushi', 'usr_sur_majid',  'SURVEYOR', pw);
  perform public.seed_demo_account('imran',      'Imran Shaikh',     'usr_sur_imran',  'SURVEYOR', pw);

  -- Departmental reviewers --------------------------------------------------
  perform public.seed_demo_account('ahmed',   'Ahmed Siddiqui', 'usr_rev_ahmed',  'DEPARTMENT_REVIEWER', pw, 'TECHNICAL');
  perform public.seed_demo_account('fatima',  'Fatima Zahra',   'usr_rev_fatima', 'DEPARTMENT_REVIEWER', pw, 'COMMERCIAL');
  perform public.seed_demo_account('vikram',  'Vikram Rao',     'usr_rev_vikram', 'DEPARTMENT_REVIEWER', pw, 'PLANNING');
  perform public.seed_demo_account('salim',   'Salim Al Amri',  'usr_rev_salim',  'DEPARTMENT_REVIEWER', pw, 'PROCUREMENT');
  perform public.seed_demo_account('grace',   'Grace Mwangi',   'usr_rev_grace',  'DEPARTMENT_REVIEWER', pw, 'HSE');
  perform public.seed_demo_account('peter',   'Peter Okonkwo',  'usr_rev_peter',  'DEPARTMENT_REVIEWER', pw, 'QUALITY');
  perform public.seed_demo_account('mariam',  'Mariam Youssef', 'usr_rev_mariam', 'DEPARTMENT_REVIEWER', pw, 'HR_ADMIN');
end
$seed$;

-- Check what was created:
--   select username, full_name, role, department from public.profiles order by role, username;
