-- ============================================================================
--  Radwa Gulf and Co — shared workspace state (cross-device sync)
--
--  Run this AFTER 0001_auth_profiles.sql, in the Supabase SQL Editor
--  (Dashboard → SQL Editor → New query → paste → Run). Safe to re-run.
--
--  The problem it solves
--    Until now the whole workflow database lived in each browser's
--    localStorage, so a change made on one device was invisible everywhere
--    else. This is the single shared copy that every device reads and writes
--    instead.
--
--  Why one JSON document rather than 28 tables
--    The application already treats its database as one value: `dispatch`
--    clones it, applies one pure operation, and commits the whole thing or
--    nothing. One row with one `jsonb` column mirrors that exactly, so the
--    sync layer is a single save/load seam instead of 28 sets of CRUD plus
--    foreign keys. A normalised schema is the right shape for a production
--    system with real concurrency and reporting; it is not what this app's
--    write path is built around today.
--
--  Concurrency
--    `save_workspace` is a compare-and-swap: a write lands only if the caller
--    holds the revision that is currently stored. A caller that has fallen
--    behind gets the current document back and replays its operation against
--    it, so two people working on different enquiries both keep their work.
-- ============================================================================

-- ------------------------------------------------------------- the table --

create table if not exists public.workspace_state (
  -- Single-row table. The constant primary key makes that explicit and makes
  -- every query a primary-key lookup.
  id          text primary key default 'default' check (id = 'default'),
  -- The entire DemoDatabase. NULL means "never initialised": the first client
  -- to connect uploads its local copy, which is what carries existing work up
  -- from whichever browser currently holds it.
  data        jsonb,
  -- Incremented on every successful write. The compare-and-swap token.
  revision    bigint not null default 0,
  updated_at  timestamptz not null default now(),
  updated_by  uuid references auth.users (id) on delete set null
);

comment on table public.workspace_state is
  'The shared workflow database, one JSON document. Written only through save_workspace(), which enforces compare-and-swap on revision.';

insert into public.workspace_state (id, data, revision)
values ('default', null, 0)
on conflict (id) do nothing;

-- ------------------------------------------------------------- the pulse --

-- Realtime notifications carry the full row, and the full row here is the
-- entire database. Broadcasting that on every keystroke-sized change would
-- push megabytes to every connected tab for no benefit, because a client that
-- hears "something changed" is going to fetch anyway.
--
-- So the notification is split off into its own tiny row. Only this table is
-- published; `workspace_state` is not.
create table if not exists public.workspace_pulse (
  id          text primary key default 'default' check (id = 'default'),
  revision    bigint not null default 0,
  -- Which browser tab wrote, so a client can ignore the echo of its own write
  -- instead of re-fetching state it already has.
  client_id   text,
  updated_at  timestamptz not null default now()
);

comment on table public.workspace_pulse is
  'Change notification for workspace_state. Deliberately tiny: realtime sends whole rows, and workspace_state.data is far too big to broadcast.';

insert into public.workspace_pulse (id, revision)
values ('default', 0)
on conflict (id) do nothing;

-- -------------------------------------------------------- row-level security

alter table public.workspace_state enable row level security;
alter table public.workspace_pulse enable row level security;

-- Any signed-in user may read. Nobody may read anonymously.
drop policy if exists "workspace readable by authenticated users" on public.workspace_state;
create policy "workspace readable by authenticated users"
  on public.workspace_state for select
  to authenticated
  using (true);

drop policy if exists "pulse readable by authenticated users" on public.workspace_pulse;
create policy "pulse readable by authenticated users"
  on public.workspace_pulse for select
  to authenticated
  using (true);

-- Deliberately NO insert/update/delete policy on either table. Direct writes
-- are impossible; the only write path is save_workspace() below, which is
-- SECURITY DEFINER and performs the revision check. That makes the
-- compare-and-swap unskippable rather than merely conventional.

-- -------------------------------------------------------------- the writer --

create or replace function public.save_workspace(
  p_revision bigint,
  p_data     jsonb,
  p_client   text default null
)
returns table (
  accepted     boolean,
  new_revision bigint,
  server_data  jsonb
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current bigint;
begin
  if auth.uid() is null then
    raise exception 'save_workspace requires an authenticated session'
      using errcode = '42501';
  end if;

  -- Lock the row for the duration of the transaction so two simultaneous
  -- writers cannot both read the same revision and both believe they won.
  select w.revision into v_current
  from public.workspace_state w
  where w.id = 'default'
  for update;

  if v_current is null then
    raise exception 'workspace_state row is missing; re-run migration 0002'
      using errcode = 'P0002';
  end if;

  if v_current <> p_revision then
    -- Stale write. Hand back the current document so the caller can replay its
    -- operation against it rather than silently losing the change.
    return query
      select false, w.revision, w.data
      from public.workspace_state w
      where w.id = 'default';
    return;
  end if;

  update public.workspace_state
  set data       = p_data,
      revision   = revision + 1,
      updated_at = now(),
      updated_by = auth.uid()
  where id = 'default';

  -- Fires the realtime notification other devices are listening for.
  update public.workspace_pulse
  set revision   = v_current + 1,
      client_id  = p_client,
      updated_at = now()
  where id = 'default';

  return query
    select true, w.revision, null::jsonb
    from public.workspace_state w
    where w.id = 'default';
end;
$$;

comment on function public.save_workspace is
  'Compare-and-swap write of the shared workspace. Returns accepted=false plus the current document when the caller is behind.';

revoke all on function public.save_workspace(bigint, jsonb, text) from public, anon;
grant execute on function public.save_workspace(bigint, jsonb, text) to authenticated;

-- ------------------------------------------------------------- realtime ----

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'workspace_pulse'
  ) then
    alter publication supabase_realtime add table public.workspace_pulse;
  end if;
end;
$$;

-- ----------------------------------------------------------------- checks --
--   select id, revision, updated_at,
--          pg_size_pretty(pg_column_size(data)::bigint) as document_size
--   from public.workspace_state;
--
--   select * from public.workspace_pulse;
