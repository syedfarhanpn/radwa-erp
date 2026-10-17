-- ============================================================================
--  Radwa Gulf and Co — HR Manager role and account
--
--  Run this in the Supabase SQL Editor after 0001–0003. Safe to re-run.
--
--  What it does
--    • Widens the profiles.role constraint to admit 'HR'.
--    • Creates the HR Manager's sign-in account (nadia / radwa2026).
--
--  The HR role owns the employee register and the joining form. The MD can
--  read the register; nobody else can open it, because salaries, passport and
--  iqama numbers are not general-access data.
--
--  NOTE ON THE EMPLOYEE RECORDS THEMSELVES
--    They are not a table here. The whole workflow database — enquiries, bid
--    packages and now employees — lives in workspace_state.data as one JSON
--    document (see 0002). Adding the HR module therefore needs no schema
--    change beyond this role, and the records sync across devices through the
--    same path as everything else.
-- ============================================================================

-- --------------------------------------------------- widen the constraint --

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

-- ------------------------------------------------------- the HR account ----

-- seed_demo_account is defined in 0003 (the corrected version that writes the
-- bookkeeping columns and creates the auth.identities row). Running 0003 first
-- is what makes this account able to sign in at all.
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

-- ----------------------------------------------------------------- checks --
--  Should return one row, role HR:
--    select username, full_name, role from public.profiles where role = 'HR';
--
--  Should return 19:
--    select count(*) from public.profiles;
