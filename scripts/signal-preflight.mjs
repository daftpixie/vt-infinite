// Explicit operator probe only. No deployment hook, public endpoint, remote writes or credential output.
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import postgres from 'postgres';

const STATS_URL = 'https://plausible.io/api/v2/query';
const TABLES = `select to_regclass('site.public_snapshots') is not null as snapshots,
  to_regclass('site.pulse_refresh_leases') is not null as leases`;
const PRIVILEGES = `select current_user = 'EXPECTED_ROLE' as role_matches,
  (select rolcanlogin from pg_roles where rolname = 'EXPECTED_ROLE') as login_enabled,
  has_table_privilege('site_reader', 'site.public_snapshots', 'select') as reader_snapshots,
  has_table_privilege('site_reader', 'site.pulse_refresh_leases', 'select') as reader_leases,
  has_table_privilege('site_refresher', 'site.pulse_refresh_leases', 'select') as refresher_select,
  has_table_privilege('site_refresher', 'site.pulse_refresh_leases', 'insert') as refresher_insert,
  has_table_privilege('site_refresher', 'site.pulse_refresh_leases', 'update') as refresher_update,
  (select bool_and(relrowsecurity) from pg_class where oid in ('site.public_snapshots'::regclass, 'site.pulse_refresh_leases'::regclass)) as rls`;

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
      if (!tables?.snapshots || !tables?.leases) { result.database[role] = { status: 'not-ready', snapshots: tables?.snapshots === true, leases: tables?.leases === true }; continue; }
      const [checks] = await connection.readOnly(PRIVILEGES.replaceAll('EXPECTED_ROLE', role));
      const ready = checks?.role_matches === true && checks.login_enabled === true && checks.reader_snapshots === true && checks.reader_leases === false && checks.refresher_select === true && checks.refresher_insert === true && checks.refresher_update === true && checks.rls === true;
      // Only fixed boolean findings survive, never connection/source values.
      result.database[role] = { status: ready ? 'ready' : 'not-ready', ...Object.fromEntries(['role_matches', 'login_enabled', 'reader_snapshots', 'reader_leases', 'refresher_select', 'refresher_insert', 'refresher_update', 'rls'].map((key) => [key, checks?.[key] === true])) };
    } catch { result.database[role] = { status: 'unavailable' }; }
    finally { try { await connection?.close(); } catch { /* No raw error output. */ } }
  }
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const result = await signalPreflight();
  console.log(JSON.stringify(result, null, 2));
  process.exitCode = result.storageConfigured && result.stats.status === 'valid' && Object.values(result.database).every((item) => item.status === 'ready') ? 0 : 2;
}
