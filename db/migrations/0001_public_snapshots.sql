-- Approved public projections (PRD §19, §26 `public_snapshots`).
--
-- Amended before it was ever applied (stage 2d): the table lives in its own
-- schema, which is not exposed to the Supabase Data API, with row level
-- security on and access only through two dedicated roles. Roles are created
-- NOLOGIN; the owner gives them LOGIN and a password by hand (see
-- docs/ops/database.md). No password ever appears in this repository.

create schema if not exists site;
revoke all on schema site from public;

create table if not exists site.public_snapshots (
  key            text primary key check (key ~ '^[a-z0-9][a-z0-9:-]{0,127}$'),
  schema_version integer     not null,
  fetched_at     timestamptz not null,
  data           jsonb       not null,
  updated_at     timestamptz not null default now()
);

alter table site.public_snapshots enable row level security;
revoke all on table site.public_snapshots from public;

-- Supabase API roles get nothing here, even if the schema were ever exposed.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on schema site from anon';
    execute 'revoke all on table site.public_snapshots from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on schema site from authenticated';
    execute 'revoke all on table site.public_snapshots from authenticated';
  end if;
end
$$;

-- Page reads: select only.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'site_reader') then
    create role site_reader nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'site_refresher') then
    create role site_refresher nologin;
  end if;
end
$$;

grant usage on schema site to site_reader, site_refresher;
grant select on table site.public_snapshots to site_reader;
-- The refresh job upserts: select, insert and update; never delete.
grant select, insert, update on table site.public_snapshots to site_refresher;

-- With RLS on, each role also needs a policy for the rows it may touch.
drop policy if exists snapshots_read on site.public_snapshots;
create policy snapshots_read on site.public_snapshots
  for select to site_reader, site_refresher using (true);

drop policy if exists snapshots_insert on site.public_snapshots;
create policy snapshots_insert on site.public_snapshots
  for insert to site_refresher with check (true);

drop policy if exists snapshots_update on site.public_snapshots;
create policy snapshots_update on site.public_snapshots
  for update to site_refresher using (true) with check (true);
