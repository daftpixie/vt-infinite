// Explicit operator probe only. No deployment hook, public endpoint, remote writes or credential output.
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import postgres from 'postgres';

const STATS_URL = 'https://plausible.io/api/v2/query';
// Catalog lookup also reports missing schema USAGE without resolving a protected table name.
const TABLES = `select exists (select 1 from pg_namespace where nspname = 'site') as schema_exists,
  coalesce((select has_schema_privilege(current_user, oid, 'usage') from pg_namespace where nspname = 'site'), false) as schema_usage,
  exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'site' and c.relname = 'public_snapshots' and c.relkind in ('r', 'p')) as snapshots,
  exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'site' and c.relname = 'pulse_refresh_leases' and c.relkind in ('r', 'p')) as leases`;
const PRIVILEGES = `select current_user = 'EXPECTED_ROLE' as role_matches,
  (select rolcanlogin from pg_roles where rolname = 'EXPECTED_ROLE') as login_enabled,
  has_schema_privilege(current_user, 'site', 'usage') as schema_usage,
  has_table_privilege('site_reader', 'site.public_snapshots', 'select') as reader_snapshots_select,
  (has_table_privilege('site_reader', 'site.public_snapshots', 'insert, update, delete, truncate, references, trigger')
    or has_any_column_privilege('site_reader', 'site.public_snapshots', 'insert, update, references')) as reader_snapshots_write,
  (has_table_privilege('site_reader', 'site.pulse_refresh_leases', 'select, insert, update, delete, truncate, references, trigger')
    or has_any_column_privilege('site_reader', 'site.pulse_refresh_leases', 'select, insert, update, references')) as reader_leases_access,
  has_table_privilege('site_refresher', 'site.public_snapshots', 'select') as refresher_snapshots_select,
  has_table_privilege('site_refresher', 'site.public_snapshots', 'insert') as refresher_snapshots_insert,
  has_table_privilege('site_refresher', 'site.public_snapshots', 'update') as refresher_snapshots_update,
  has_table_privilege('site_refresher', 'site.public_snapshots', 'delete') as refresher_snapshots_delete,
  has_table_privilege('site_refresher', 'site.pulse_refresh_leases', 'select') as refresher_leases_select,
  has_table_privilege('site_refresher', 'site.pulse_refresh_leases', 'insert') as refresher_leases_insert,
  has_table_privilege('site_refresher', 'site.pulse_refresh_leases', 'update') as refresher_leases_update,
  has_table_privilege('site_refresher', 'site.pulse_refresh_leases', 'delete') as refresher_leases_delete,
  (select relrowsecurity from pg_class where oid = 'site.public_snapshots'::regclass) as snapshots_rls,
  (select relrowsecurity from pg_class where oid = 'site.pulse_refresh_leases'::regclass) as leases_rls`;
// Missing/null catalog fields fail closed, including the fields expected to be false.
const REQUIRED = ['role_matches', 'login_enabled', 'schema_usage', 'reader_snapshots_select',
  'refresher_snapshots_select', 'refresher_snapshots_insert', 'refresher_snapshots_update',
  'refresher_leases_select', 'refresher_leases_insert', 'refresher_leases_update', 'snapshots_rls', 'leases_rls'];
const PROHIBITED = ['reader_snapshots_write', 'reader_leases_access', 'refresher_snapshots_delete', 'refresher_leases_delete'];

function openDatabase(url) {
  const sql = postgres(url, { prepare: false, max: 1, connect_timeout: 5, ssl: 'require', onnotice: () => {} });
  return { readOnly: (query) => sql.begin('read only', (transaction) => transaction.unsafe(query)), close: () => sql.end({ timeout: 1 }) };
}

export async function signalPreflight({ env = process.env, fetchImpl = fetch, database = openDatabase } = {}) {
  const result = { storageConfigured: env.SNAPSHOT_STORE === 'postgres', stats: { status: 'skipped', reason: 'authorized credential binding absent' }, database: {} };
  if (env.PLAUSIBLE_SITE_ID && env.PLAUSIBLE_API_KEY) {
    const started = performance.now();
    let status = null;
    try {
      const response = await fetchImpl(STATS_URL, {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(8000), cache: 'no-store',
        headers: { Authorization: `Bearer ${env.PLAUSIBLE_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ site_id: env.PLAUSIBLE_SITE_ID, metrics: ['pageviews'], date_range: '24h', dimensions: [], include: { imports: false } }),
      });
      status = response.status;
      let valid = false;
      if (response.ok) {
        // Bound even an unexpected upstream error/success payload, and never print any of it.
        const reader = response.body?.getReader();
        const chunks = []; let size = 0;
        if (!reader) throw new Error('empty body');
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > 524288) { await reader.cancel(); throw new Error('body bound'); }
          chunks.push(value);
        }
        const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        valid = Array.isArray(body.results) && body.results.length <= 1 && body.results.every((row) => Array.isArray(row.dimensions) && row.dimensions.length === 0 && Array.isArray(row.metrics) && row.metrics.length === 1 && Number.isSafeInteger(row.metrics[0]) && row.metrics[0] >= 0);
      }
      result.stats = { status: response.ok && valid ? 'valid' : 'unavailable', httpStatus: status, valid, latencyMs: Math.round(performance.now() - started) };
    } catch { result.stats = { status: 'unavailable', httpStatus: status, valid: false, latencyMs: Math.round(performance.now() - started) }; }
  }
  for (const [role, name] of [['site_reader', 'SNAPSHOT_DATABASE_URL_READ'], ['site_refresher', 'SNAPSHOT_DATABASE_URL_REFRESH']]) {
    if (!env[name]) { result.database[role] = { status: 'skipped', reason: 'authorized connection binding absent' }; continue; }
    let connection;
    try {
      connection = database(env[name]);
      const [tables] = await connection.readOnly(TABLES);
      if (!tables?.schema_exists || !tables.schema_usage || !tables.snapshots || !tables.leases) { result.database[role] = { status: 'not-ready', schema_exists: tables?.schema_exists === true, schema_usage: tables?.schema_usage === true, snapshots: tables?.snapshots === true, leases: tables?.leases === true }; continue; }
      const [checks] = await connection.readOnly(PRIVILEGES.replaceAll('EXPECTED_ROLE', role));
      const ready = REQUIRED.every((key) => checks?.[key] === true) && PROHIBITED.every((key) => checks?.[key] === false);
      // Only fixed boolean findings survive, never connection/source values.
      result.database[role] = { status: ready ? 'ready' : 'not-ready', schema_exists: true, snapshots: true, leases: true, ...Object.fromEntries([...REQUIRED, ...PROHIBITED].map((key) => [key, checks?.[key] === true])) };
    } catch { result.database[role] = { status: 'unavailable' }; }
    finally { try { await connection?.close(); } catch { /* No raw error output. */ } }
  }
  return { ...result, ready: result.storageConfigured && result.stats.status === 'valid' && Object.values(result.database).every((item) => item.status === 'ready') };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const result = await signalPreflight();
  console.log(JSON.stringify(result, null, 2));
  process.exitCode = result.ready ? 0 : 2;
}
