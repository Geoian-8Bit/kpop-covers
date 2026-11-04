// REQ-01 · M-12: source files over 600 lines. Fails when one is over the limit and not listed in EXCEPTIONS.
// EXCEPTIONS shrinks phase by phase as the big files are split; the goal is an empty list.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LIMIT = 600;
const DIRS = ['apps/web/src', 'packages/shared/src'];

// Files that exceed the limit today (baseline). Remove each one as it drops under 600 lines.
const EXCEPTIONS = new Set([
  'apps/web/src/features/formations/FormationEditor.tsx',
  'apps/web/src/features/formations/StageView.tsx',
  'apps/web/src/features/record/RecordStudio.tsx',
  'apps/web/src/features/review/CompareStage.tsx',
  'apps/web/src/features/review/ReviewControls.tsx',
  'apps/web/src/features/review/ReviewMedia.tsx',
  'apps/web/src/features/review/ReviewScreen.tsx',
  'apps/web/src/features/review/reviewRules.ts',
  'apps/web/src/features/takes/TakesPanel.tsx',
  'packages/shared/src/recording.ts',
]);

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) yield* walk(full);
    else yield full;
  }
}

const over = [];
for (const dir of DIRS) {
  for (const file of walk(path.join(root, dir))) {
    const rel = path.relative(root, file).split(path.sep).join('/');
    if (!/\.tsx?$/.test(rel) || /\.test\./.test(rel) || rel.endsWith('database.types.ts')) continue;
    const text = readFileSync(file, 'utf8');
    const lines = text.endsWith('\n') ? text.split('\n').length - 1 : text.split('\n').length;
    if (lines > LIMIT) over.push({ rel, lines });
  }
}
over.sort((a, b) => b.lines - a.lines);

const fresh = over.filter((f) => !EXCEPTIONS.has(f.rel));
const stale = [...EXCEPTIONS].filter((e) => !over.some((f) => f.rel === e));
console.log(
  `M-12: ${over.length} files over ${LIMIT} lines (${over.length - fresh.length} allowed by EXCEPTIONS)`,
);
for (const f of over)
  console.log(
    `  ${String(f.lines).padStart(5)}  ${f.rel}${EXCEPTIONS.has(f.rel) ? '' : '  <-- NOT ALLOWED'}`,
  );
if (stale.length) console.log(`Under the limit now, remove from EXCEPTIONS:\n  ${stale.join('\n  ')}`);
if (fresh.length) {
  console.error(`FAIL: ${fresh.length} file(s) over ${LIMIT} lines and not in EXCEPTIONS.`);
  process.exit(1);
}
