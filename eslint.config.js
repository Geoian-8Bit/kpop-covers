// REQ-00 · ESLint (flat config) for the whole monorepo: `pnpm lint`.
import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/dev-dist/**',
      '**/node_modules/**',
      '**/coverage/**',
      '**/playwright-report/**',
      '**/test-results/**',
      'packages/shared/src/database.types.ts',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      // `_name` marks a parameter or binding that is unused on purpose (callbacks, destructuring that drops a key).
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_', ignoreRestSiblings: true },
      ],
    },
  },
  // The web app: browser code with React hooks.
  {
    files: ['apps/web/src/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    languageOptions: { globals: globals.browser },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // React Compiler rules (react-hooks 7): the app predates the compiler and is not built with it. These flag
      // long-standing, working patterns (setState in effects that sync with outside state, refs read during render
      // for gesture bookkeeping, Date.now() in render…) whose rewrite is a refactor, not a lint fix. Warnings until
      // the code is moved over piece by piece.
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/refs': 'warn',
      'react-hooks/purity': 'warn',
      'react-hooks/immutability': 'warn',
      'react-hooks/preserve-manual-memoization': 'warn',
      'react-hooks/static-components': 'warn',
      'react-hooks/use-memo': 'warn',
      'react-hooks/incompatible-library': 'warn',
      'react-hooks/globals': 'warn',
      'react-hooks/error-boundaries': 'warn',
      'react-hooks/set-state-in-render': 'warn',
      'react-hooks/unsupported-syntax': 'warn',
      'react-hooks/config': 'warn',
      'react-hooks/gating': 'warn',
      'react-hooks/component-hook-factories': 'warn',
    },
  },
  // Node: tooling, configs, Vercel functions, scripts and the e2e specs (which run in Node; page.evaluate bodies
  // run in the browser, hence both).
  {
    files: [
      '*.{js,mjs,ts}',
      'scripts/**',
      'supabase/tests/**',
      'apps/web/*.{js,ts}',
      'apps/web/api/**',
      'apps/web/e2e/**',
      'packages/shared/**',
    ],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
  // Service worker (push notices).
  {
    files: ['apps/web/public/**/*.js'],
    languageOptions: { globals: globals.serviceworker },
  },
  // Supabase Edge Functions run on Deno.
  {
    files: ['supabase/functions/**'],
    languageOptions: { globals: { ...globals.browser, Deno: 'readonly' } },
  },
);
