-- Approved public projections (PRD §19, §26 `public_snapshots`).
-- Not applied anywhere yet: no database is provisioned.
create table if not exists public_snapshots (
  key            text primary key check (key ~ '^[a-z0-9][a-z0-9:-]{0,127}$'),
  schema_version integer     not null,
  fetched_at     timestamptz not null,
  data           jsonb       not null,
  updated_at     timestamptz not null default now()
);

-- Public routes read through a role that can only select; the refresh job
-- writes through a separate role. Role names are assigned at provisioning.
