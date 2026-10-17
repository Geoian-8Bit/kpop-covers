#!/usr/bin/env node
// P2 · Production deploy with a version number: `pnpm deploy:prod` from the repository root.
//
// Vercel builds remotely without .git (the CLI doesn't upload it), so the build can't count commits by itself. This
// script counts them here (`git rev-list --count HEAD`) and hands the number to the build as `APP_BUILD`
// (`vercel --prod --yes -b APP_BUILD=<n>`); vite.config.ts turns it into «Versión <n>» and /version.json.
//
// Refuses a shallow clone (its count is small and never grows). Extra arguments go to `vercel` as they are (quoted
// on Windows; a token given with --token is printed as ***). `--dry-run` prints the command without running it.
// Node only, no dependencies; works the same on Windows.

import { execFileSync, spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const passThrough = args.filter((arg) => arg !== '--dry-run');

function fail(message) {
  console.error(`\n[deploy] ${message}\n`);
  process.exit(1);
}

function git(...gitArgs) {
  try {
    return execFileSync('git', gitArgs, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  } catch (error) {
    fail(`git ${gitArgs.join(' ')} ha fallado: ${error.stderr?.toString().trim() || error.message}`);
  }
}

const shallow = git('rev-parse', '--is-shallow-repository');
if (shallow !== 'false') {
  fail(
    'Este clon es superficial (o git es demasiado antiguo para saberlo): el número de versión saldría mal.\n' +
      '         Usa un clon completo (git fetch --unshallow) y vuelve a lanzarlo.',
  );
}

const count = git('rev-list', '--count', 'HEAD');
if (!/^\d+$/.test(count) || Number(count) <= 0) fail(`Número de commits inesperado: «${count}».`);

const branch = git('rev-parse', '--abbrev-ref', 'HEAD');
const commit = git('rev-parse', '--short', 'HEAD');
const dirty = git('status', '--porcelain') !== '';
if (dirty) console.warn('[deploy] Aviso: hay cambios sin confirmar; se despliegan, pero el número es el del último commit.');

const vercelArgs = ['--prod', '--yes', '-b', `APP_BUILD=${count}`, ...passThrough];
const windows = process.platform === 'win32';

// A word cmd.exe and the shim's Node read back as it is; anything else goes in double quotes, where & | < > ^ and
// spaces are plain text. Double quotes, % (cmd expands it even inside quotes) and line breaks can't be passed safely.
function cmdQuote(arg) {
  return /^[\w\-=.:/@+,*]+$/.test(arg) ? arg : `"${arg}"`;
}

if (windows) {
  for (const [i, arg] of vercelArgs.entries()) {
    if (/["%\r\n]/.test(arg)) {
      fail(`Argumento ${masked(vercelArgs)[i]} no admitido en Windows: lleva comillas, % o un salto de línea.`);
    }
  }
}

// What gets printed: the value of --token / -t (also --token=…) never reaches the console or a log.
function masked(list) {
  return list.map((arg, i) => {
    if (/^(--token|-t)=/.test(arg)) return `${arg.slice(0, arg.indexOf('=') + 1)}***`;
    return i > 0 && (list[i - 1] === '--token' || list[i - 1] === '-t') ? '***' : arg;
  });
}

const commandLine = ['vercel', ...vercelArgs.map(cmdQuote)].join(' ');
console.log(`[deploy] Versión ${count} · ${branch} @ ${commit}`);
console.log(`[deploy] ${['vercel', ...masked(vercelArgs).map(cmdQuote)].join(' ')}`);
if (dryRun) process.exit(0);

// On Windows `vercel` is a .cmd shim, which only starts through cmd.exe. We hand cmd one quoted line ourselves (as
// Node's own `shell: true` does, but without its DEP0190 warning and with every argument quoted).
const child = windows
  ? spawn(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', `"${commandLine}"`], {
      cwd: root,
      stdio: 'inherit',
      windowsVerbatimArguments: true,
    })
  : spawn('vercel', vercelArgs, { cwd: root, stdio: 'inherit' });
child.on('error', (error) => fail(`No se pudo lanzar vercel (¿está instalada la CLI?): ${error.message}`));
child.on('exit', (code, signal) => process.exit(signal ? 1 : (code ?? 1)));
