// Local database check without Docker or the Supabase CLI: `pnpm db:test`.
// Boots an in-memory Postgres (PGlite, Postgres compiled to WASM), lays down a small stub of what a Supabase project
// already has (supabase-stub.sql: API roles, auth.*, storage.*, extensions.pgcrypto, default grants), applies every
// migration in supabase/migrations/ from scratch in filename order, creates the default group row (DEPLOY.md, step 2)
// and runs every supabase/tests/*.sql check script, printing its PASS / INCONCLUSIVE notices.
// Exit code 0 = all migrations applied and every check file finished; 1 = something failed (details above the summary).
// The stub is close to Supabase but not identical (see its header): a green run here is a fast first signal, not a
// replacement for running the checks against the real project after deploying.

import { readFile, readdir } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';

const here = dirname(fileURLToPath(import.meta.url));
const supabaseDir = join(here, '..', '..');
const repoRoot = join(supabaseDir, '..');
const migrationsDir = join(supabaseDir, 'migrations');
const testsDir = join(supabaseDir, 'tests');

/** Sorted `*.sql` files of a directory (filename order = migration order). */
async function sqlFiles(dir) {
  const names = (await readdir(dir)).filter((n) => n.endsWith('.sql')).sort();
  return names.map((n) => join(dir, n));
}

const rel = (p) => relative(repoRoot, p).replaceAll('\\', '/');

/** Postgres error → one readable block (message, code and where it happened). */
function describeError(err) {
  const lines = [`${err.message}${err.code ? ` (SQLSTATE ${err.code})` : ''}`];
  if (err.detail) lines.push(`detail: ${err.detail}`);
  if (err.hint) lines.push(`hint: ${err.hint}`);
  if (err.where) lines.push(`where: ${err.where}`);
  if (err.position) lines.push(`position: ${err.position}`);
  return lines.map((l) => `    ${l}`).join('\n');
}

/** Runs a multi-statement script; leaves no open/aborted transaction behind if it fails. */
async function runScript(db, sql, onNotice) {
  try {
    await db.exec(sql, onNotice ? { onNotice } : undefined);
  } catch (err) {
    if (db.isInTransaction()) await db.exec('rollback');
    throw err;
  }
}

const failures = [];
let migrationsApplied = 0;
let testsPassed = 0;
let passNotices = 0;

const db = await PGlite.create({ extensions: { pgcrypto } });

try {
  // 1) What Supabase provides before any migration.
  const stubPath = join(here, 'supabase-stub.sql');
  try {
    await runScript(db, await readFile(stubPath, 'utf8'));
    console.log(`stub      ${rel(stubPath)}`);
  } catch (err) {
    failures.push(rel(stubPath));
    console.error(`FAIL stub ${rel(stubPath)}\n${describeError(err)}`);
    throw new Error('stub', { cause: err });
  }

  // 2) Migrations from scratch, each one atomic (like `supabase db push`).
  for (const file of await sqlFiles(migrationsDir)) {
    const sql = await readFile(file, 'utf8');
    try {
      await db.transaction((tx) => tx.exec(sql));
      migrationsApplied++;
      console.log(`migration ${rel(file)}`);
    } catch (err) {
      failures.push(rel(file));
      console.error(`FAIL migration ${rel(file)}\n${describeError(err)}`);
      throw new Error('migration', { cause: err });
    }
  }

  // 3) Seed: the app never creates groups, it uses the oldest crew (docs/DEPLOY.md).
  //    crews.created_by is nullable since 20261013000000 and defaults to auth.uid() (null here).
  await db.exec(`insert into public.crews (name) values ('One Shoot');`);
  console.log(`seed      default group 'One Shoot'`);

  // 4) Check scripts: each runs in one go (they open/rollback their own transaction) as postgres, like the SQL editor.
  for (const file of await sqlFiles(testsDir)) {
    console.log(`\ntest      ${rel(file)}`);
    const onNotice = (notice) => {
      const msg = notice.message ?? '';
      if (msg.startsWith('PASS')) passNotices++;
      console.log(`  ${notice.severity === 'NOTICE' ? '' : `${notice.severity}: `}${msg}`);
    };
    try {
      await runScript(db, await readFile(file, 'utf8'), onNotice);
      testsPassed++;
      console.log(`  ok`);
    } catch (err) {
      failures.push(rel(file));
      console.error(`  FAIL ${rel(file)}\n${describeError(err)}`);
    }
  }
} catch (err) {
  // Stub / migration failures are already printed; anything else is a harness bug worth showing.
  if (!['stub', 'migration'].includes(err.message)) {
    failures.push('harness');
    console.error(err);
  }
} finally {
  await db.close();
}

const total = (await sqlFiles(testsDir)).length;
console.log(
  `\nsummary   migrations applied: ${migrationsApplied}/${(await sqlFiles(migrationsDir)).length}` +
    ` · test files passed: ${testsPassed}/${total} · PASS checks: ${passNotices}`,
);
if (failures.length) {
  console.error(`FAILED    ${failures.join(', ')}`);
  process.exit(1);
}
console.log('OK');
