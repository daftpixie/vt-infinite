-- ADR 0011. Matthew applies this file; the build session does not change a database.
-- Data stays in site.public_snapshots, using its existing last-good projection contract.
create table if not exists site.pulse_refresh_leases (
  key text primary key check (key ~ '^pulse:v1:[a-f0-9]{32}:(recent|history)$'),
  owner text not null,
  next_attempt_at timestamptz not null
);
alter table site.pulse_refresh_leases enable row level security;
revoke all on table site.pulse_refresh_leases from public;
grant select, insert, update on table site.pulse_refresh_leases to site_refresher;
drop policy if exists pulse_leases_refresh on site.pulse_refresh_leases;
create policy pulse_leases_refresh on site.pulse_refresh_leases
  for all to site_refresher using (true) with check (true);
-- No delete grant, no Data API grants, no public access. Missing table/privilege fails closed.
