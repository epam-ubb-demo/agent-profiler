import baseConfig from '@agent-profiler/eslint-config';

/**
 * Root ESLint configuration — extends the shared workspace config
 * and adds monorepo-specific boundary rules (T0.1.3).
 */

/** @type {import('eslint').Linter.Config[]} */
export default [
  ...baseConfig,

  // T0.1.3 — Layered architecture boundary rules.
  // Packages must not import from apps (enforced via import-x/no-restricted-paths).
  {
    files: ['packages/core/src/**/*.{ts,tsx}'],
    plugins: {},
    rules: {
      'import-x/no-restricted-paths': [
        'error',
        {
          zones: [
            {
              target: './packages/core/src',
              from: './apps',
              message: 'Core package must not import from apps.',
            },
            {
              target: './packages/core/src',
              from: './packages/ui/src',
              message: 'Core package must not import from UI package.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['packages/ui/src/**/*.{ts,tsx}'],
    plugins: {},
    rules: {
      'import-x/no-restricted-paths': [
        'error',
        {
          zones: [
            {
              target: './packages/ui/src',
              from: './apps',
              message: 'UI package must not import from apps.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['packages/pricing/src/**/*.{ts,tsx}'],
    plugins: {},
    rules: {
      'import-x/no-restricted-paths': [
        'error',
        {
          zones: [
            {
              target: './packages/pricing/src',
              from: './apps',
              message: 'Pricing package must not import from apps.',
            },
          ],
        },
      ],
    },
  },
];
